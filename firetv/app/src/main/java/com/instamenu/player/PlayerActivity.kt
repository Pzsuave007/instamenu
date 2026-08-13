package com.instamenu.player

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The whole player. It does five things and nothing else:
 * identify itself, fetch config + playlist, cache media, play it fullscreen, send heartbeats.
 * All business rules stay on the server so this APK rarely needs to change.
 */
class PlayerActivity : AppCompatActivity() {
    private lateinit var store: DeviceStore
    private lateinit var api: ApiClient
    private lateinit var cache: MediaCache
    private lateinit var playlistStore: PlaylistStore

    private lateinit var imageView: ImageView
    private lateinit var playerView: PlayerView
    private lateinit var pairingPanel: View
    private lateinit var pairingCode: TextView
    private lateinit var idleName: TextView

    private var exo: ExoPlayer? = null
    private var playback: Job? = null
    private var items: List<LocalItem> = emptyList()
    private var activeVersion = -1
    private var activePlaylistId: String? = null

    @SuppressLint("SourceLockedOrientationActivity")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_player)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        store = DeviceStore(this)
        api = ApiClient(store)
        cache = MediaCache(this, api)
        playlistStore = PlaylistStore(this)

        imageView = findViewById(R.id.image)
        playerView = findViewById(R.id.video)
        pairingPanel = findViewById(R.id.pairing_panel)
        pairingCode = findViewById(R.id.pairing_code)
        idleName = findViewById(R.id.idle_name)

        exo = ExoPlayer.Builder(this).build().also {
            it.volume = 0f            // menu boards are always muted
            playerView.player = it
            playerView.useController = false
        }

        if (store.deviceToken == null) startPairing() else startPlaybackLoop()
    }

    // ---------------- pairing ----------------
    private fun startPairing() {
        pairingPanel.visibility = View.VISIBLE
        idleName.visibility = View.GONE
        lifecycleScope.launch {
            while (store.deviceToken == null) {
                val code = withContext(Dispatchers.IO) { runCatching { api.requestPairing() }.getOrNull() }
                if (code?.already_paired == true && code.device_token != null) {
                    store.deviceToken = code.device_token
                    break
                }
                if (code?.code == null) {
                    delay(10_000); continue
                }
                pairingCode.text = code.code
                // Poll until the dashboard claims this code, then we own a permanent token.
                var attempts = 0
                while (store.deviceToken == null && attempts < 180) {
                    attempts += 1
                    delay(5_000)
                    val status = withContext(Dispatchers.IO) { runCatching { api.pairStatus(code.code) }.getOrNull() }
                    if (status?.paired == true && status.device_token != null) {
                        store.deviceToken = status.device_token
                    }
                }
            }
            pairingPanel.visibility = View.GONE
            startPlaybackLoop()
        }
    }

    // ---------------- sync + playback ----------------
    private fun startPlaybackLoop() {
        // Show whatever we already have before touching the network.
        playlistStore.load()?.let { saved ->
            val local = cache.localItemsFor(saved)
            if (local.isNotEmpty()) {
                activeVersion = saved.version
                activePlaylistId = saved.playlist_id
                activate(local, saved.image_fit)
            }
        }
        showIdleIfEmpty()

        lifecycleScope.launch {
            while (true) {
                val interval = syncOnce()
                delay(interval * 1000L)
            }
        }
    }

    /** One heartbeat + optional safe update. Returns seconds until the next run. */
    private suspend fun syncOnce(): Int = withContext(Dispatchers.IO) {
        try {
            val config = api.config()
            withContext(Dispatchers.Main) {
                config.organization?.name?.let { store.organizationName = it; idleName.text = it }
                config.screen?.image_fit?.let { store.imageFit = it }
            }
            val hb = api.heartbeat(
                playlistId = activePlaylistId,
                playlistVersion = activeVersion.coerceAtLeast(0),
                status = if (items.isEmpty()) "idle" else "playing",
            )
            // A device moved to another screen gets a different playlist id, so compare both.
            val screenChanged = config.playlist_id != activePlaylistId
            if (hb.update_available || screenChanged || activeVersion < 0 || items.isEmpty()) {
                val playlist = api.playlist()
                if (playlist.version != activeVersion || playlist.playlist_id != activePlaylistId || items.isEmpty()) {
                    val prepared = cache.prepare(playlist)      // download everything first
                    if (prepared != null) {                     // only then swap
                        withContext(Dispatchers.Main) {
                            activeVersion = playlist.version
                            activePlaylistId = playlist.playlist_id
                            activate(prepared, playlist.image_fit)
                        }
                        playlistStore.save(playlist)
                        store.playlistVersion = playlist.version
                        cache.pruneExcept(playlist)             // old files removed after activation
                    } else {
                        Log.w(TAG, "download incomplete, keeping version $activeVersion")
                    }
                }
            }
            hb.next_heartbeat_seconds.coerceAtLeast(15)
        } catch (unauthorized: ApiClient.Unauthorized) {
            store.clearToken()
            withContext(Dispatchers.Main) { recreate() }
            60
        } catch (offline: Exception) {
            Log.w(TAG, "offline, continuing with cached content: ${offline.message}")
            30 // retry sooner while disconnected; playback is untouched
        }
    }

    private fun activate(newItems: List<LocalItem>, imageFit: String) {
        items = newItems
        store.imageFit = imageFit
        playback?.cancel()
        showIdleIfEmpty()
        if (items.isEmpty()) return
        playback = lifecycleScope.launch { runLoop() }
    }

    private suspend fun runLoop() {
        var index = 0
        while (true) {
            val snapshot = items
            if (snapshot.isEmpty()) return
            val entry = snapshot[index % snapshot.size]
            if (entry.item.type == "video") playVideo(entry) else showImage(entry)
            index += 1
        }
    }

    private fun applyFit(view: ImageView) {
        view.scaleType = when (store.imageFit) {
            "fit" -> ImageView.ScaleType.FIT_CENTER
            "stretch" -> ImageView.ScaleType.FIT_XY
            else -> ImageView.ScaleType.CENTER_CROP
        }
    }

    private suspend fun showImage(entry: LocalItem) {
        withContext(Dispatchers.Main) {
            exo?.stop()
            playerView.visibility = View.GONE
            imageView.visibility = View.VISIBLE
            applyFit(imageView)
            imageView.setImageURI(android.net.Uri.fromFile(entry.file))
        }
        delay(((entry.item.duration ?: 10).coerceAtLeast(1)) * 1000L)
    }

    private suspend fun playVideo(entry: LocalItem) {
        val finished = kotlinx.coroutines.CompletableDeferred<Unit>()
        withContext(Dispatchers.Main) {
            imageView.visibility = View.GONE
            playerView.visibility = View.VISIBLE
            val player = exo ?: return@withContext
            player.clearMediaItems()
            player.setMediaItem(MediaItem.fromUri(android.net.Uri.fromFile(entry.file)))
            player.repeatMode = Player.REPEAT_MODE_OFF
            player.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_ENDED) { player.removeListener(this); finished.complete(Unit) }
                }
                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    Log.w(TAG, "video error, skipping: ${error.message}")
                    player.removeListener(this); finished.complete(Unit)
                }
            })
            player.prepare()
            player.play()
        }
        finished.await()
    }

    private fun showIdleIfEmpty() {
        val empty = items.isEmpty()
        idleName.visibility = if (empty) View.VISIBLE else View.GONE
        idleName.text = store.organizationName
        if (empty) {
            imageView.visibility = View.GONE
            playerView.visibility = View.GONE
        }
    }

    private fun hideSystemBars() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            )
    }

    override fun onResume() {
        super.onResume()
        hideSystemBars()
        exo?.playWhenReady = true
    }

    override fun onDestroy() {
        playback?.cancel()
        exo?.release()
        exo = null
        super.onDestroy()
    }

    private companion object { const val TAG = "InstaMenuPlayer" }
}

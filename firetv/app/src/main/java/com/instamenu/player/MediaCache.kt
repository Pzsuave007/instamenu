package com.instamenu.player

import java.io.File

/**
 * Local media cache with a safe two-phase playlist swap:
 * download everything for the new version, verify it, only then activate it.
 * The currently playing files are never deleted before the new set is complete.
 */
class MediaCache(context: android.content.Context, private val api: ApiClient) {

    private val dir = File(context.filesDir, "media").apply { mkdirs() }

    private fun fileFor(item: PlaylistItem): File {
        val extension = item.filename.substringAfterLast('.', if (item.type == "video") "mp4" else "jpg")
        return File(dir, "${item.id}.$extension")
    }

    /** True when every asset of this playlist is already on disk. */
    fun isComplete(playlist: Playlist): Boolean =
        playlist.items.isNotEmpty() && playlist.items.all { fileFor(it).let { f -> f.exists() && f.length() > 0 } }

    /** Returns the playable set, or null if any download failed (keep playing the old one). */
    fun prepare(playlist: Playlist): List<LocalItem>? {
        val prepared = ArrayList<LocalItem>(playlist.items.size)
        for (item in playlist.items) {
            if (item.type == "url") {          // web links (Canva, etc.) stream live, nothing to cache
                prepared.add(LocalItem(item, null))
                continue
            }
            val target = fileFor(item)
            if (!target.exists() || target.length() == 0L) {
                val ok = runCatching { api.download(item.url, target) }.getOrDefault(false)
                if (!ok) return null
            }
            prepared.add(LocalItem(item, target))
        }
        return prepared
    }

    /** Called only after a successful activation. */
    fun pruneExcept(playlist: Playlist) {
        val keep = playlist.items.map { fileFor(it).name }.toSet()
        dir.listFiles()?.forEach { file -> if (file.name !in keep) file.delete() }
    }

    fun localItemsFor(playlist: Playlist): List<LocalItem> =
        playlist.items.mapNotNull { item ->
            if (item.type == "url") LocalItem(item, null)
            else fileFor(item).takeIf { it.exists() }?.let { LocalItem(item, it) }
        }
}

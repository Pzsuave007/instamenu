package com.instamenu.player

import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/** Thin client for the display-device REST API. Every call is token authenticated. */
class ApiClient(private val store: DeviceStore) {

    private val json = Json { ignoreUnknownKeys = true }
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .callTimeout(300, TimeUnit.SECONDS) // large videos
        .retryOnConnectionFailure(true)
        .build()

    private val base = BuildConfig.API_BASE_URL.trimEnd('/')
    private val appVersion = BuildConfig.VERSION_NAME

    class Unauthorized : Exception("device token rejected")

    private fun body(payload: String) = payload.toRequestBody("application/json".toMediaType())

    private fun call(request: Request): String {
        http.newCall(request).execute().use { response ->
            if (response.code == 401) throw Unauthorized()
            if (!response.isSuccessful) throw IllegalStateException("HTTP ${response.code}")
            return response.body?.string().orEmpty()
        }
    }

    private fun authed(url: String) = Request.Builder()
        .url(url)
        .header("X-Device-Token", store.deviceToken.orEmpty())

    fun requestPairing(): PairRequestResponse {
        val payload = """{"hardware_id":"${store.hardwareId}","app_version":"$appVersion","model":"${android.os.Build.MODEL}"}"""
        val request = Request.Builder().url("$base/api/device/pair/request").post(body(payload)).build()
        return json.decodeFromString(call(request))
    }

    fun pairStatus(code: String): PairStatusResponse {
        val url = "$base/api/device/pair/status?hardware_id=${store.hardwareId}&code=$code"
        return json.decodeFromString(call(Request.Builder().url(url).build()))
    }

    fun config(): DeviceConfig = json.decodeFromString(call(authed("$base/api/device/config").build()))

    fun playlist(): Playlist = json.decodeFromString(call(authed("$base/api/device/playlist").build()))

    fun heartbeat(playlistVersion: Int, status: String): HeartbeatResponse {
        val payload = """{"app_version":"$appVersion","playlist_version":$playlistVersion,"status":"$status"}"""
        return json.decodeFromString(call(authed("$base/api/device/heartbeat").post(body(payload)).build()))
    }

    /** Streams a media file to disk. Returns false if the download was incomplete. */
    fun download(url: String, target: java.io.File): Boolean {
        val temp = java.io.File(target.parentFile, target.name + ".part")
        http.newCall(Request.Builder().url(url).build()).execute().use { response ->
            if (!response.isSuccessful) return false
            val stream = response.body?.byteStream() ?: return false
            temp.outputStream().use { out -> stream.copyTo(out, DEFAULT_BUFFER_SIZE) }
        }
        if (temp.length() == 0L) {
            temp.delete()
            return false
        }
        return temp.renameTo(target)
    }
}

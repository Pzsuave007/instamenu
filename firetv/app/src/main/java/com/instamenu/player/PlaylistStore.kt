package com.instamenu.player

import android.content.Context
import kotlinx.serialization.json.Json
import java.io.File

/**
 * Keeps the last successfully activated playlist on disk so a cold start with no
 * Internet still shows content instead of a blank screen.
 */
class PlaylistStore(context: Context) {

    private val json = Json { ignoreUnknownKeys = true; prettyPrint = false }
    private val file = File(context.filesDir, "playlist.json")

    fun save(playlist: Playlist) = runCatching { file.writeText(json.encodeToString(Playlist.serializer(), playlist)) }

    fun load(): Playlist? = runCatching {
        if (!file.exists()) null else json.decodeFromString(Playlist.serializer(), file.readText())
    }.getOrNull()
}

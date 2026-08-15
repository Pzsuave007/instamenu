package com.instamenu.player

import kotlinx.serialization.Serializable

@Serializable
data class PairRequestResponse(
    val code: String? = null,
    val expires_at: String? = null,
    val already_paired: Boolean = false,
    val device_token: String? = null,
)

@Serializable
data class PairStatusResponse(
    val paired: Boolean = false,
    val device_token: String? = null,
)

@Serializable
data class ScreenConfig(
    val id: String? = null,
    val name: String? = null,
    val orientation: String = "landscape",
    val image_fit: String = "fill",
    val default_image_duration: Int = 10,
)

@Serializable
data class OrganizationInfo(val name: String? = null, val active: Boolean = true)

@Serializable
data class DeviceConfig(
    val organization: OrganizationInfo? = null,
    val screen: ScreenConfig? = null,
    val playlist_id: String? = null,
    val playlist_version: Int? = null,
    val heartbeat_interval_seconds: Int = 60,
)

@Serializable
data class PlaylistItem(
    val id: String,
    val position: Int = 0,
    val type: String = "image",
    val filename: String = "",
    val url: String,
    val size: Long? = null,
    val duration: Int? = null,
    val cache_key: String = "",
)

@Serializable
data class Playlist(
    val playlist_id: String? = null,
    val name: String? = null,
    val version: Int = 0,
    val image_fit: String = "fill",
    val default_image_duration: Int = 10,
    val items: List<PlaylistItem> = emptyList(),
)

@Serializable
data class HeartbeatResponse(
    val ok: Boolean = true,
    val screen_id: String? = null,
    val playlist_id: String? = null,
    val playlist_version: Int? = null,
    val update_available: Boolean = false,
    val next_heartbeat_seconds: Int = 60,
)

/** A playlist whose assets are all present on local storage, ready to play. */
data class LocalItem(val item: PlaylistItem, val file: java.io.File?)

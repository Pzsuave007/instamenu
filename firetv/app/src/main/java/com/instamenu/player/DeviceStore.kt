package com.instamenu.player

import android.content.Context
import androidx.core.content.edit

/**
 * Persistent device identity. The pairing code is needed only once; after that the
 * device token is the credential. Restaurant passwords never reach the TV.
 */
class DeviceStore(context: Context) {

    private val prefs = context.getSharedPreferences("instamenu", Context.MODE_PRIVATE)

    val hardwareId: String
        get() = prefs.getString(KEY_HARDWARE_ID, null) ?: java.util.UUID.randomUUID().toString()
            .also { prefs.edit { putString(KEY_HARDWARE_ID, it) } }

    var deviceToken: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) = prefs.edit { putString(KEY_TOKEN, value) }

    var playlistVersion: Int
        get() = prefs.getInt(KEY_VERSION, -1)
        set(value) = prefs.edit { putInt(KEY_VERSION, value) }

    var organizationName: String
        get() = prefs.getString(KEY_ORG, "InstaMenu") ?: "InstaMenu"
        set(value) = prefs.edit { putString(KEY_ORG, value) }

    var imageFit: String
        get() = prefs.getString(KEY_FIT, "fill") ?: "fill"
        set(value) = prefs.edit { putString(KEY_FIT, value) }

    fun clearToken() = prefs.edit { remove(KEY_TOKEN); remove(KEY_VERSION) }

    private companion object {
        const val KEY_HARDWARE_ID = "hardware_id"
        const val KEY_TOKEN = "device_token"
        const val KEY_VERSION = "playlist_version"
        const val KEY_ORG = "organization_name"
        const val KEY_FIT = "image_fit"
    }
}

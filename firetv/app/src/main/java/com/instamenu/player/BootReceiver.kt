package com.instamenu.player

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restarts the menu board after a Fire TV reboot or power cut. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == "android.intent.action.QUICKBOOT_POWERON") {
            context.startActivity(
                Intent(context, PlayerActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }
}

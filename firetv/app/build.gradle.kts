plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.instamenu.player"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.instamenu.player"
        minSdk = 22          // Fire TV Stick 1st gen and newer
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        // Point the app at your InstaMenu server. Override per build if you self-host.
        buildConfigField(
            "String",
            "API_BASE_URL",
            "\"${project.findProperty("instamenuApiBaseUrl") ?: "https://firetv-dash.preview.emergentagent.com"}\""
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug") // replace with your own keystore for production
        }
    }

    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
        // Media3's ExoPlayer/PlayerView APIs are @UnstableApi (opt-in required to compile).
        freeCompilerArgs = freeCompilerArgs + "-opt-in=androidx.media3.common.util.UnstableApi"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("io.coil-kt:coil:2.6.0")
    implementation("androidx.media3:media3-exoplayer:1.3.1")
    implementation("androidx.media3:media3-ui:1.3.1")
}

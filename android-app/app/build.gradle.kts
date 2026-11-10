plugins {
    id("com.android.application")
}
android {
    namespace = "club.tobymusic.students"
    compileSdk = 35
    defaultConfig {
        applicationId = "club.tobymusic.students"
        minSdk = 26
        targetSdk = 34
        versionCode = 2
        versionName = "1.0.1"
    }
    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

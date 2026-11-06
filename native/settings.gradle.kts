pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositories {
        mavenLocal() // app.valenced:api, built from the public Valenced source by the workflow
        google()
        mavenCentral()
        maven(url = "https://api.xposed.info/")
    }
}
rootProject.name = "kmmiio-native"

// The native (Kotlin) parts of the plugins ported from kmmiio99o. Each one is built where its sources are.
include(":chatbubbles")
project(":chatbubbles").projectDir = file("../plugins/chatbubbles")
include(":declutter")
project(":declutter").projectDir = file("../plugins/declutter")
include(":multi-scrobbler")
project(":multi-scrobbler").projectDir = file("../plugins/multi-scrobbler")
include(":materialcord")
project(":materialcord").projectDir = file("../plugins/materialcord")

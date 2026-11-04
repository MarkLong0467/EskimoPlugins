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
rootProject.name = "native-parts"
include(":always-animate-native")

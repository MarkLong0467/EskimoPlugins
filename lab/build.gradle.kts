import com.android.build.api.dsl.LibraryExtension
import com.android.build.api.variant.LibraryAndroidComponentsExtension
import org.gradle.process.ExecOperations
import org.jetbrains.kotlin.gradle.dsl.KotlinAndroidProjectExtension
import javax.inject.Inject

plugins {
    id("com.android.library") version "9.2.1" apply false
}

interface Exec { @get:Inject val ops: ExecOperations }
val execOps = objects.newInstance<Exec>().ops

val sdk = "36"
val minSdkVer = "24"
val java = "25"

subprojects {
    pluginManager.apply("com.android.library")
    extensions.configure<LibraryExtension> {
        namespace = "marklong.lab." + name.replace(Regex("[^A-Za-z0-9]"), "_")
        compileSdk = sdk.toInt()
        defaultConfig { minSdk = minSdkVer.toInt() }
        compileOptions {
            sourceCompatibility = JavaVersion.toVersion(java)
            targetCompatibility = JavaVersion.toVersion(java)
        }
        sourceSets { named("main") { kotlin.directories += "src/main/kotlin" } }
    }
    extensions.configure<KotlinAndroidProjectExtension> { jvmToolchain(java.toInt()) }
    tasks.configureEach { if (name.contains("Lint") || name.startsWith("lint")) enabled = false }
    dependencies {
        add("compileOnly", "app.valenced:api:1.0.0")
        add("compileOnly", "de.robv.android.xposed:api:82")
        add("compileOnly", "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
        add("compileOnly", "org.luckypray:dexkit:2.3.0")
    }

    val sdkDir = extensions.getByType<LibraryAndroidComponentsExtension>().sdkComponents.sdkDirectory
    tasks.register("dexJar") {
        dependsOn("compileReleaseKotlin", "compileReleaseJavaWithJavac")
        val classDirs = files(
            layout.buildDirectory.dir("intermediates/built_in_kotlinc/release/compileReleaseKotlin/classes"),
            layout.buildDirectory.dir("tmp/kotlin-classes/release"),
            layout.buildDirectory.dir("intermediates/javac/release/classes"),
        )
        val out = layout.buildDirectory.file("outputs/plugin/plugin.jar")
        outputs.file(out)
        doLast {
            val classes = classDirs.asFileTree.matching { include("**/*.class") }.files
            require(classes.isNotEmpty()) { "no classes to dex" }
            val root = sdkDir.get().asFile
            val d8 = File(root, "build-tools").listFiles()!!.sortedByDescending { it.name }.map { File(it, "d8") }.first { it.isFile }
            val androidJar = File(root, "platforms/android-$sdk/android.jar")
            out.get().asFile.parentFile.mkdirs()
            execOps.exec {
                commandLine(d8.absolutePath, "--min-api", minSdkVer, "--lib", androidJar.absolutePath,
                    "--output", out.get().asFile.absolutePath, *classes.map { it.absolutePath }.toTypedArray())
            }
        }
    }
}

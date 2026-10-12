// Standalone Groovy check of the generated block, using Android DSL test doubles.
// This does not load AGP, compile native code, or claim a Linux/macOS host build.
assert args.length == 1 : 'Pass the generated staging-only Gradle file.'
def generated = new File(args[0])
assert generated.isFile()
def originalOs = System.getProperty('os.name')
def originalLocale = Locale.getDefault()
try {
    // Windows detection must not depend on the user's default locale.
    Locale.setDefault(Locale.forLanguageTag('tr-TR'))
    ['Windows 11', 'WINDOWS 10', 'Linux', 'Mac OS X', 'Darwin'].each { os ->
        System.setProperty('os.name', os)
        def root = new File('generated-android-root').absoluteFile
        def definitions = [
            ['expo-modules-core', 'com.android.library', 'expo'],
            ['react-native-nitro-modules', 'com.android.library', 'nitro'],
            ['react-native-nitro-google-signin', 'com.android.library', 'google-signin'],
            ['unrelated-library', 'com.android.library', null],
            ['expo-modules-core', 'com.android.application', null]
        ]
        def finalizers = []
        def states = definitions.collect { definition ->
            def cmake = new Expando(buildStagingDirectory: new File('initial-stage'))
            def android = new Expando(externalNativeBuild: new Expando(cmake: cmake))
            def components = new Expando(finalizeDsl: { Closure callback -> finalizers << { callback.call(android) } })
            def plugins = new Expando(withId: { String id, Closure callback ->
                if (definition[1] == id) callback.call()
            })
            def extensions = new Expando(getByName: { String name ->
                assert name == 'androidComponents' : "Unexpected Android extension: ${name}"
                components
            })
            [project: new Expando(name: definition[0], plugins: plugins, extensions: extensions), cmake: cmake, stage: definition[2]]
        }
        def binding = new Binding([
            rootProject: new Expando(file: { String path -> new File(root, path) }),
            subprojects: { Closure callback -> states.each { callback.call(it.project) } }
        ])
        new GroovyShell(binding).evaluate(generated)
        // Vendor Android DSL configuration runs after plugin registration.
        states.each { it.cmake.buildStagingDirectory = new File('vendor-stage') }
        finalizers.each { it.call() }
        def windows = os.toLowerCase(Locale.ROOT).contains('windows')
        assert finalizers.size() == (windows ? 3 : 0)
        states.each { state ->
            def expected = windows && state.stage != null ? new File(root, '.cxx/' + state.stage) : new File('vendor-stage')
            assert state.cmake.buildStagingDirectory == expected : "${os}: ${state.project.name} staging mismatch"
        }
        println "PASS ${os}: ${states.size()} projects; ${finalizers.size()} finalized staging changes"
    }
} finally {
    System.setProperty('os.name', originalOs)
    Locale.setDefault(originalLocale)
}

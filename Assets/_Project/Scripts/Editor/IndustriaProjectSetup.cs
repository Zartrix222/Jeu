using System.IO;
using Industria.Core;
using Industria.Rendering;
using UnityEditor;
#if UNITY_2021_2_OR_NEWER
using UnityEditor.Build;
#endif
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
#if INDUSTRIA_URP
using UnityEngine.Rendering.Universal;
#endif

namespace Industria.EditorTools
{
    /// <summary>
    /// One-click project configuration: URP asset (if missing), template materials in Resources
    /// (so shaders ship in builds), player settings for Android / iOS, and the Main scene.
    /// Runs automatically the first time the project is opened.
    /// </summary>
    [InitializeOnLoad]
    public static class IndustriaProjectSetup
    {
        public const string Root = "Assets/_Project";
        public const string ScenePath = Root + "/Scenes/Main.unity";
        public const string MaterialsPath = Root + "/Resources/Materials";
        public const string SettingsPath = Root + "/Settings";
        private const string SessionKey = "Industria.AutoSetupDone";

        static IndustriaProjectSetup()
        {
            EditorApplication.delayCall += AutoSetup;
        }

        private static void AutoSetup()
        {
            // Pressing Play from any scene always starts the game in Main.
            var mainScene = AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath);
            if (mainScene != null) EditorSceneManager.playModeStartScene = mainScene;

            if (SessionState.GetBool(SessionKey, false)) return;
            SessionState.SetBool(SessionKey, true);
            if (EditorApplication.isPlayingOrWillChangePlaymode) return;

            if (!File.Exists(ScenePath) || !File.Exists(MaterialsPath + "/IndustriaLit.mat"))
            {
                Debug.Log("[Industria] Première ouverture : configuration automatique du projet…");
                Run();
            }

            // Open Main instead of an empty "Untitled" scene.
            var active = EditorSceneManager.GetActiveScene();
            if (string.IsNullOrEmpty(active.path) && !active.isDirty && File.Exists(ScenePath))
                EditorSceneManager.OpenScene(ScenePath);
        }

        [MenuItem("Industria/▶ Jouer", priority = -100)]
        public static void Play()
        {
            if (!File.Exists(MaterialsPath + "/IndustriaLit.mat")) Run();
            var mainScene = AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath);
            if (mainScene != null) EditorSceneManager.playModeStartScene = mainScene;
            EditorApplication.isPlaying = true;
        }

        [MenuItem("Industria/Diagnostic", priority = 10)]
        public static void Diagnostic()
        {
            var sb = new System.Text.StringBuilder("[Industria] Diagnostic du projet\n");
            void Line(bool ok, string text) => sb.AppendLine((ok ? "  OK      " : "  PROBLÈME ") + text);
            Line(true, "Unity " + Application.unityVersion);
            var rp = GraphicsSettings.defaultRenderPipeline;
            Line(rp != null, "Pipeline de rendu : " + (rp != null ? rp.name : "Built-in (URP recommandé : Industria > Configurer le projet)"));
            Line(File.Exists(ScenePath), "Scène principale : " + ScenePath);
            bool inBuild = false;
            foreach (var sc in EditorBuildSettings.scenes) if (sc.path == ScenePath && sc.enabled) inBuild = true;
            Line(inBuild, "Scène dans les Build Settings");
            foreach (var m in new[] { "IndustriaLit", "IndustriaLitEmissive", "IndustriaGhost", "IndustriaTerrain", "IndustriaSky", "IndustriaParticle" })
                Line(File.Exists($"{MaterialsPath}/{m}.mat"), "Matériau " + m);
#if ENABLE_INPUT_SYSTEM
            Line(true, "Entrées : Input System");
#elif ENABLE_LEGACY_INPUT_MANAGER
            Line(true, "Entrées : ancien Input Manager");
#endif
            Line(PlayerSettings.colorSpace == ColorSpace.Linear, "Espace colorimétrique linéaire");
            Debug.Log(sb.ToString());
        }

        [MenuItem("Industria/Construire/Windows (PC)", priority = 60)]
        public static void BuildWindows() => BuildFor(BuildTarget.StandaloneWindows64, "Builds/Windows/ProjectIndustria.exe");

        [MenuItem("Industria/Construire/Android (APK)", priority = 61)]
        public static void BuildAndroid() => BuildFor(BuildTarget.Android, "Builds/Android/ProjectIndustria.apk");

        private static void BuildFor(BuildTarget target, string output)
        {
            Run();
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = output,
                target = target,
                options = BuildOptions.None,
            };
            var report = BuildPipeline.BuildPlayer(options);
            if (report.summary.result == UnityEditor.Build.Reporting.BuildResult.Succeeded)
            {
                Debug.Log($"[Industria] Build réussi : {Path.GetFullPath(output)}");
                EditorUtility.RevealInFinder(output);
            }
            else
            {
                Debug.LogError($"[Industria] Build échoué ({report.summary.result}). Vérifiez que le module de plateforme est installé dans Unity Hub.");
            }
        }

        [MenuItem("Industria/Configurer le projet", priority = 0)]
        public static void Run()
        {
            EnsureFolder(Root + "/Scenes");
            EnsureFolder(MaterialsPath);
            EnsureFolder(SettingsPath);
            ConfigureRenderPipeline();
            CreateMaterials();
            ConfigurePlayer();
            CreateMainScene();
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("[Industria] Projet configuré. Ouvrez Assets/_Project/Scenes/Main.unity et appuyez sur Play.");
        }

        [MenuItem("Industria/Ouvrir la scène principale", priority = 20)]
        public static void OpenMainScene()
        {
            if (!File.Exists(ScenePath)) CreateMainScene();
            if (EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) EditorSceneManager.OpenScene(ScenePath);
        }

        [MenuItem("Industria/Sauvegardes/Ouvrir le dossier", priority = 40)]
        public static void OpenSaveFolder()
        {
            var dir = Path.Combine(Application.persistentDataPath, "Saves");
            Directory.CreateDirectory(dir);
            EditorUtility.RevealInFinder(dir);
        }

        [MenuItem("Industria/Sauvegardes/Supprimer la sauvegarde", priority = 41)]
        public static void DeleteSave()
        {
            if (!EditorUtility.DisplayDialog("Supprimer la sauvegarde", "Supprimer définitivement la sauvegarde locale ?", "Supprimer", "Annuler")) return;
            new Industria.Save.SaveSystem().Delete();
            Debug.Log("[Industria] Sauvegarde supprimée.");
        }

        // ------------------------------------------------------------------ Steps

        private static void ConfigureRenderPipeline()
        {
            if (GraphicsSettings.defaultRenderPipeline != null)
            {
                Debug.Log($"[Industria] Pipeline de rendu déjà configuré : {GraphicsSettings.defaultRenderPipeline.name}");
                return;
            }
#if INDUSTRIA_URP
            var rendererData = ScriptableObject.CreateInstance<UniversalRendererData>();
            AssetDatabase.CreateAsset(rendererData, SettingsPath + "/Industria_Renderer.asset");
            var urp = UniversalRenderPipelineAsset.Create(rendererData);
            urp.shadowDistance = 90f;
            urp.msaaSampleCount = 2;
            urp.supportsHDR = true;
            AssetDatabase.CreateAsset(urp, SettingsPath + "/Industria_URP.asset");
            GraphicsSettings.defaultRenderPipeline = urp;
            int current = QualitySettings.GetQualityLevel();
            for (int i = 0; i < QualitySettings.names.Length; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                QualitySettings.renderPipeline = urp;
            }
            QualitySettings.SetQualityLevel(current, false);
            Debug.Log("[Industria] Asset URP créé et assigné (Graphics + Quality).");
#else
            Debug.LogWarning("[Industria] Package URP absent : le jeu utilisera le pipeline Built-in. Installez 'Universal RP' via le Package Manager.");
#endif
        }

        private static void CreateMaterials()
        {
            bool urp = GraphicsSettings.defaultRenderPipeline != null;
            var lit = Shader.Find(urp ? "Universal Render Pipeline/Lit" : "Standard");
            if (lit == null) { Debug.LogError("[Industria] Shader Lit introuvable."); return; }

            var baseMat = new Material(lit) { enableInstancing = true };
            Save(baseMat, "IndustriaLit");

            // Variant with emission so the keyword survives shader stripping in builds.
            var emissive = new Material(lit) { enableInstancing = true };
            emissive.EnableKeyword("_EMISSION");
            emissive.SetColor("_EmissionColor", Color.white);
            emissive.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            Save(emissive, "IndustriaLitEmissive");

            var ghost = new Material(lit);
            MaterialLibrary.MakeTransparent(ghost, urp);
            ghost.EnableKeyword("_EMISSION");
            Save(ghost, "IndustriaGhost");

            var terrainShader = Shader.Find(urp ? "Universal Render Pipeline/Terrain/Lit" : "Nature/Terrain/Standard");
            if (terrainShader != null) Save(new Material(terrainShader) { enableInstancing = true }, "IndustriaTerrain");

            var particleShader = Shader.Find(urp ? "Universal Render Pipeline/Particles/Unlit" : "Particles/Standard Unlit");
            if (particleShader != null)
            {
                var particle = new Material(particleShader);
                MaterialLibrary.MakeTransparent(particle, urp);
                Save(particle, "IndustriaParticle");
            }

            var skyShader = Shader.Find("Skybox/Procedural");
            if (skyShader != null)
            {
                var sky = new Material(skyShader);
                MaterialLibrary.ConfigureSky(sky);
                Save(sky, "IndustriaSky");
            }
        }

        private static void Save(Material mat, string name)
        {
            string path = $"{MaterialsPath}/{name}.mat";
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing != null)
            {
                existing.shader = mat.shader;
                existing.CopyPropertiesFromMaterial(mat);
                existing.shaderKeywords = mat.shaderKeywords;
                existing.renderQueue = mat.renderQueue;
                existing.enableInstancing = mat.enableInstancing;
                EditorUtility.SetDirty(existing);
            }
            else
            {
                AssetDatabase.CreateAsset(mat, path);
            }
        }

        private static void ConfigurePlayer()
        {
            PlayerSettings.companyName = "Industria Studio";
            PlayerSettings.productName = GameInfo.Title;
            PlayerSettings.bundleVersion = GameInfo.Version;
            PlayerSettings.colorSpace = ColorSpace.Linear;
            const string bundleId = "com.industriastudio.projectindustria";
#if UNITY_2021_2_OR_NEWER
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, bundleId);
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.iOS, bundleId);
#else
            PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.Android, bundleId);
            PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.iOS, bundleId);
#endif
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.AutoRotation;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;
        }

        private static void CreateMainScene()
        {
            if (File.Exists(ScenePath))
            {
                AddSceneToBuild();
                return;
            }
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            new GameObject("GameRoot").AddComponent<GameRoot>();
            EditorSceneManager.SaveScene(scene, ScenePath);
            AddSceneToBuild();
            Debug.Log($"[Industria] Scène créée : {ScenePath}");
        }

        private static void AddSceneToBuild()
        {
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            var parent = Path.GetDirectoryName(path)?.Replace('\\', '/');
            if (!string.IsNullOrEmpty(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }
    }
}

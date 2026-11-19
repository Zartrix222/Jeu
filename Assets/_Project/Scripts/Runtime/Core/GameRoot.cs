using Industria.Building;
using Industria.Content;
using Industria.Factory;
using Industria.Input;
using Industria.Player;
using Industria.Rendering;
using Industria.Save;
using Industria.Scanner;
using Industria.Simulation.Content;
using Industria.Simulation.Items;
using Industria.Simulation.Save;
using Industria.UI;
using Industria.World;
using UnityEngine;

namespace Industria.Core
{
    /// <summary>
    /// Composition root: creates every system once, wires them together and drives the game flow
    /// (main menu, new game, load, save, pause). Systems stay small and only talk through this root.
    /// </summary>
    [DefaultExecutionOrder(-400)]
    public sealed class GameRoot : MonoBehaviour
    {
        public static GameRoot Instance { get; private set; }

        public ContentDatabase Content { get; private set; }
        public MaterialLibrary Materials { get; private set; }
        public GameInput Input { get; private set; }
        public NotificationService Notifications { get; private set; }
        public SaveSystem Saves { get; private set; }
        public ObjectiveTracker Objectives { get; private set; }
        public ScannerSystem Scanner { get; private set; }
        public WorldGenerator World { get; private set; }
        public FactoryWorld Factory { get; private set; }
        public ThirdPersonCamera CameraRig { get; private set; }
        public PlayerController Player { get; private set; }
        public PlayerAvatar Avatar { get; private set; }
        public PlayerInteractor Interactor { get; private set; }
        public BuildModeController Build { get; private set; }
        public GameHUD Hud { get; private set; }
        public Inventory PlayerInventory { get; private set; }

        public GameState State { get; private set; } = GameState.Boot;
        public double PlayTime { get; private set; }

        private float _autosaveTimer;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;

            if (Application.isMobilePlatform)
            {
                Application.targetFrameRate = 60;
                Screen.sleepTimeout = SleepTimeout.NeverSleep;
            }

            Content = ContentLoader.Load();
            Materials = new MaterialLibrary();
            Notifications = new NotificationService();
            Saves = new SaveSystem();
            Objectives = new ObjectiveTracker();
            Scanner = new ScannerSystem();
            PlayerInventory = new Inventory(GameInfo.PlayerInventorySlots, Content.Items);

            Input = gameObject.AddComponent<GameInput>();
            EnvironmentSetup.Apply(Materials, transform);
            CameraRig = ThirdPersonCamera.Create(Input);

            World = new WorldGenerator(Content, Materials);
            World.Generate(GameInfo.DefaultSeed);
            CameraRig.MenuFocus = World.SpawnPoint;

            Factory = new GameObject("FactoryWorld").AddComponent<FactoryWorld>();
            Factory.Init(Content, Materials, CameraRig.Camera);

            Build = gameObject.AddComponent<BuildModeController>();
            Build.Init(this);
            Hud = gameObject.AddComponent<GameHUD>();
            Hud.Init(this);

            State = GameState.MainMenu;
            Debug.Log($"[Game] {GameInfo.Title} {GameInfo.Version} prêt. Sauvegardes : {Saves.Directory}");
        }

        private void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        private void Update()
        {
            Notifications.Update();
            Scanner.Update(this);
            if (State != GameState.Playing) return;

            PlayTime += Time.deltaTime;
            Objectives.Update(this, Time.time);

            if (Input.Pressed(GameAction.QuickSave)) SaveGame();
            if (Input.Pressed(GameAction.QuickLoad)) ContinueGame();

            _autosaveTimer += Time.unscaledDeltaTime;
            if (_autosaveTimer >= GameInfo.AutosaveIntervalSeconds)
            {
                _autosaveTimer = 0f;
                SaveGame(true);
            }
        }

        // ------------------------------------------------------------------ Game flow

        public void StartNewGame()
        {
            PrepareWorld(GameInfo.DefaultSeed);
            PlayerInventory.Clear();
            Objectives.Load(null);
            var player = EnsurePlayer();
            player.Teleport(World.SpawnPoint, 0f);
            CameraRig.SetTarget(player.transform, 0f);
            PlayTime = 0;
            EnterPlaying();
            Notifications.Push($"Bienvenue sur {GameInfo.Planet}, pionnier.", NotificationKind.Info, 6f);
            Notifications.Push("Appuyez sur [C] pour scanner les gisements.", NotificationKind.Info, 8f);
        }

        public void ContinueGame()
        {
            var save = Saves.Read();
            if (save == null)
            {
                Notifications.Push("Aucune sauvegarde lisible.", NotificationKind.Warning, 4f);
                return;
            }
            PrepareWorld(save.worldSeed);
            Factory.Restore(save, World);
            PlayerInventory.Load(save.player.inventory);
            Objectives.Load(save.completedObjectives);

            var player = EnsurePlayer();
            var p = new Vector3(save.player.position.x, save.player.position.y, save.player.position.z);
            float ground = World.GroundHeight(p);
            if (p.y < ground - 0.5f) p.y = ground + 0.5f;
            player.Teleport(p, save.player.yaw);
            CameraRig.SetTarget(player.transform, save.player.yaw);
            CameraRig.Pitch = save.player.cameraPitch;
            PlayTime = save.playTimeSeconds;
            EnterPlaying();
            Notifications.Push("Partie chargée.", NotificationKind.Success, 3f);
        }

        public void SaveGame(bool silent = false)
        {
            if (State != GameState.Playing && State != GameState.Paused) return;
            var save = new SaveGame
            {
                gameVersion = GameInfo.Version,
                worldSeed = World.Seed,
                playTimeSeconds = PlayTime,
                player = new PlayerSave
                {
                    position = new SVector3(Player.transform.position.x, Player.transform.position.y, Player.transform.position.z),
                    yaw = CameraRig.Yaw,
                    cameraPitch = CameraRig.Pitch,
                    inventory = PlayerInventory.ToList(),
                },
                completedObjectives = Objectives.Save(),
            };
            Factory.Capture(save);
            bool ok = Saves.Write(save);
            if (!silent || !ok)
                Notifications.Push(ok ? "Partie sauvegardée." : "Échec de la sauvegarde !", ok ? NotificationKind.Success : NotificationKind.Warning, 3f);
        }

        public void ReturnToMainMenu()
        {
            SetPaused(false);
            Build.Exit();
            Hud.CloseAll();
            Factory.Running = false;
            Factory.Clear();
            Scanner.Clear();
            if (Player != null) Destroy(Player.gameObject);
            Player = null;
            Avatar = null;
            Interactor = null;
            CameraRig.SetTarget(null, 0f);
            CameraRig.MenuFocus = World.SpawnPoint;
            State = GameState.MainMenu;
        }

        public void SetPaused(bool paused)
        {
            if (paused && State == GameState.Playing)
            {
                State = GameState.Paused;
                Time.timeScale = 0f;
            }
            else if (!paused && State == GameState.Paused)
            {
                State = GameState.Playing;
                Time.timeScale = 1f;
            }
        }

        public void Quit()
        {
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }

        private void PrepareWorld(int seed)
        {
            SetPaused(false);
            Build.Exit();
            Hud.CloseAll();
            Factory.Running = false;
            Factory.Clear();
            Scanner.Clear();
            if (!World.IsGenerated || World.Seed != seed) World.Generate(seed);
        }

        private void EnterPlaying()
        {
            Factory.Running = true;
            _autosaveTimer = 0f;
            State = GameState.Playing;
            Time.timeScale = 1f;
        }

        private PlayerController EnsurePlayer()
        {
            if (Player != null) return Player;
            Player = PlayerController.Create(Input, CameraRig.transform, World.GroundHeight);
            Avatar = PlayerAvatar.Build(Player.transform, Materials);
            Interactor = Player.gameObject.AddComponent<PlayerInteractor>();
            Interactor.Init(this);
            return Player;
        }

        // ------------------------------------------------------------------ Mobile lifecycle

        private void OnApplicationPause(bool pause)
        {
            // Mobile: the OS may kill the app while in background, so save when leaving.
            if (pause && State == GameState.Playing) SaveGame(true);
        }

        private void OnApplicationQuit()
        {
            if (State == GameState.Playing || State == GameState.Paused) SaveGame(true);
        }
    }
}

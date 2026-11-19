using UnityEngine;

namespace Industria.Input
{
    /// <summary>
    /// Single entry point for player input. Picks the backend matching the project's
    /// "Active Input Handling" setting and merges on-screen touch controls.
    /// Runs early so every other script reads this frame's values.
    /// </summary>
    [DefaultExecutionOrder(-500)]
    public sealed class GameInput : MonoBehaviour
    {
        private IInputBackend _backend;
        private readonly bool[] _held = new bool[(int)GameAction.Count];
        private readonly bool[] _pressed = new bool[(int)GameAction.Count];

        public TouchControls Touch { get; } = new TouchControls();
        public IInputBackend Backend => _backend;

        /// <summary>When true (a menu is open) gameplay actions read as idle; UI actions still work.</summary>
        public bool GameplayBlocked { get; set; }

        public Vector2 Move { get; private set; }
        public Vector2 Look { get; private set; }
        public float Zoom { get; private set; }

        private void Awake()
        {
#if ENABLE_INPUT_SYSTEM
            _backend = new InputSystemBackend();
#elif ENABLE_LEGACY_INPUT_MANAGER
            _backend = new LegacyInputBackend();
#else
            _backend = new NullInputBackend();
            Debug.LogError("[Input] Aucun système d'entrée actif. Vérifiez Project Settings > Player > Active Input Handling.");
#endif
            Touch.Enabled = Application.isMobilePlatform;
        }

        private void Update()
        {
            Touch.Update(_backend);

            for (int i = 0; i < (int)GameAction.Count; i++)
            {
                var a = (GameAction)i;
                _held[i] = _backend.Held(a) || Touch.Held(a);
                _pressed[i] = _backend.Pressed(a) || Touch.Pressed(a);
            }

            var move = _backend.Move + Touch.Move;
            Move = move.sqrMagnitude > 1f ? move.normalized : move;
            Look = _backend.Look + Touch.Look;
            Zoom = _backend.Zoom;
        }

        private static bool IsUiAction(GameAction a) =>
            a == GameAction.Pause || a == GameAction.Inventory || a == GameAction.QuickSave || a == GameAction.QuickLoad;

        public bool Held(GameAction action) => (!GameplayBlocked || IsUiAction(action)) && _held[(int)action];
        public bool Pressed(GameAction action) => (!GameplayBlocked || IsUiAction(action)) && _pressed[(int)action];

        public Vector2 GameplayMove => GameplayBlocked ? Vector2.zero : Move;
        public Vector2 GameplayLook => GameplayBlocked ? Vector2.zero : Look;
        public float GameplayZoom => GameplayBlocked ? 0f : Zoom;
    }
}

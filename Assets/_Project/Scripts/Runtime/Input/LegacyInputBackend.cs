#if ENABLE_LEGACY_INPUT_MANAGER
using UnityEngine;
using LegacyInput = UnityEngine.Input;

namespace Industria.Input
{
    /// <summary>
    /// Keyboard / mouse / touch through the legacy Input Manager.
    /// Supports both QWERTY (WASD) and AZERTY (ZQSD) movement keys because legacy KeyCodes follow the layout.
    /// </summary>
    public sealed class LegacyInputBackend : IInputBackend
    {
        private const float MouseSensitivity = 2.2f;

        public Vector2 Move
        {
            get
            {
                float x = 0f, y = 0f;
                if (Key(KeyCode.W) || Key(KeyCode.Z) || Key(KeyCode.UpArrow)) y += 1f;
                if (Key(KeyCode.S) || Key(KeyCode.DownArrow)) y -= 1f;
                if (Key(KeyCode.D) || Key(KeyCode.RightArrow)) x += 1f;
                if (Key(KeyCode.A) || Key(KeyCode.Q) || Key(KeyCode.LeftArrow)) x -= 1f;
                var v = new Vector2(x, y);
                return v.sqrMagnitude > 1f ? v.normalized : v;
            }
        }

        public Vector2 Look
        {
            get
            {
                if (LegacyInput.touchSupported && LegacyInput.touchCount > 0) return Vector2.zero; // touch look handled by TouchControls
                return new Vector2(SafeAxis("Mouse X"), SafeAxis("Mouse Y")) * MouseSensitivity;
            }
        }

        public float Zoom => LegacyInput.mouseScrollDelta.y;

        public bool Held(GameAction action)
        {
            switch (action)
            {
                case GameAction.Jump: return Key(KeyCode.Space);
                case GameAction.Sprint: return Key(KeyCode.LeftShift) || Key(KeyCode.RightShift);
                case GameAction.Interact: return Key(KeyCode.E);
                case GameAction.Primary: return LegacyInput.touchCount == 0 && LegacyInput.GetMouseButton(0);
                case GameAction.Secondary: return LegacyInput.touchCount == 0 && LegacyInput.GetMouseButton(1);
                default:
                    var key = KeyFor(action);
                    return key != KeyCode.None && Key(key);
            }
        }

        public bool Pressed(GameAction action)
        {
            switch (action)
            {
                case GameAction.Jump: return Down(KeyCode.Space);
                case GameAction.Interact: return Down(KeyCode.E);
                case GameAction.Primary: return LegacyInput.touchCount == 0 && LegacyInput.GetMouseButtonDown(0);
                case GameAction.Secondary: return LegacyInput.touchCount == 0 && LegacyInput.GetMouseButtonDown(1);
                case GameAction.Inventory: return Down(KeyCode.Tab) || Down(KeyCode.I);
                case GameAction.Sprint: return Down(KeyCode.LeftShift);
                default:
                    var key = KeyFor(action);
                    return key != KeyCode.None && Down(key);
            }
        }

        private static KeyCode KeyFor(GameAction action)
        {
            switch (action)
            {
                case GameAction.Rotate: return KeyCode.R;
                case GameAction.Tilt: return KeyCode.T;
                case GameAction.Roll: return KeyCode.G;
                case GameAction.ResetTilt: return KeyCode.H;
                case GameAction.BuildMode: return KeyCode.B;
                case GameAction.Deconstruct: return KeyCode.X;
                case GameAction.Inventory: return KeyCode.Tab;
                case GameAction.Scanner: return KeyCode.C;
                case GameAction.QuickSave: return KeyCode.F5;
                case GameAction.QuickLoad: return KeyCode.F9;
                case GameAction.Pause: return KeyCode.Escape;
                case GameAction.Hotbar1: return KeyCode.Alpha1;
                case GameAction.Hotbar2: return KeyCode.Alpha2;
                case GameAction.Hotbar3: return KeyCode.Alpha3;
                case GameAction.Hotbar4: return KeyCode.Alpha4;
                case GameAction.Hotbar5: return KeyCode.Alpha5;
                case GameAction.Hotbar6: return KeyCode.Alpha6;
                case GameAction.Hotbar7: return KeyCode.Alpha7;
                case GameAction.Hotbar8: return KeyCode.Alpha8;
                case GameAction.Hotbar9: return KeyCode.Alpha9;
                default: return KeyCode.None;
            }
        }

        public int TouchCount => LegacyInput.touchCount;

        public TouchSample GetTouch(int index)
        {
            var t = LegacyInput.GetTouch(index);
            return new TouchSample
            {
                Id = t.fingerId,
                Position = t.position,
                Began = t.phase == TouchPhase.Began,
                Ended = t.phase == TouchPhase.Ended || t.phase == TouchPhase.Canceled,
            };
        }

        public bool PointerOverScreen => true;
        public Vector2 PointerPosition => LegacyInput.mousePosition;

        private static bool Key(KeyCode k) => LegacyInput.GetKey(k);
        private static bool Down(KeyCode k) => LegacyInput.GetKeyDown(k);

        private static bool _axisWarningShown;

        private static float SafeAxis(string axis)
        {
            try { return LegacyInput.GetAxisRaw(axis); }
            catch (System.ArgumentException)
            {
                if (!_axisWarningShown) { _axisWarningShown = true; Debug.LogWarning($"[Input] Axe '{axis}' absent de l'Input Manager."); }
                return 0f;
            }
        }
    }
}
#endif

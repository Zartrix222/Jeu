#if ENABLE_INPUT_SYSTEM
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;

namespace Industria.Input
{
    /// <summary>
    /// Keyboard / mouse / gamepad / touch through the Input System package.
    /// Keys are physical positions, so WASD automatically becomes ZQSD on AZERTY keyboards.
    /// </summary>
    public sealed class InputSystemBackend : IInputBackend
    {
        private const float MouseSensitivity = 0.11f;
        private const float GamepadLookSpeed = 180f;

        public Vector2 Move
        {
            get
            {
                Vector2 v = Vector2.zero;
                var kb = Keyboard.current;
                if (kb != null)
                {
                    if (kb.wKey.isPressed || kb.upArrowKey.isPressed) v.y += 1f;
                    if (kb.sKey.isPressed || kb.downArrowKey.isPressed) v.y -= 1f;
                    if (kb.dKey.isPressed || kb.rightArrowKey.isPressed) v.x += 1f;
                    if (kb.aKey.isPressed || kb.leftArrowKey.isPressed) v.x -= 1f;
                }
                var pad = Gamepad.current;
                if (pad != null) v += pad.leftStick.ReadValue();
                return v.sqrMagnitude > 1f ? v.normalized : v;
            }
        }

        public Vector2 Look
        {
            get
            {
                Vector2 v = Vector2.zero;
                var mouse = Mouse.current;
                if (mouse != null && !IsTouching()) v += mouse.delta.ReadValue() * MouseSensitivity;
                var pad = Gamepad.current;
                if (pad != null) v += pad.rightStick.ReadValue() * GamepadLookSpeed * Time.unscaledDeltaTime;
                return v;
            }
        }

        public float Zoom
        {
            get
            {
                var mouse = Mouse.current;
                if (mouse == null) return 0f;
                // Scroll is ~120 per notch on Windows; normalise to ~1.
                float y = mouse.scroll.ReadValue().y;
                return Mathf.Abs(y) > 10f ? y / 120f : y;
            }
        }

        public bool Held(GameAction action)
        {
            var control = ControlFor(action);
            if (control != null && control.isPressed) return true;
            var padControl = PadControlFor(action);
            return padControl != null && padControl.isPressed;
        }

        public bool Pressed(GameAction action)
        {
            var control = ControlFor(action);
            if (control != null && control.wasPressedThisFrame) return true;
            if (action == GameAction.Inventory && Keyboard.current != null && Keyboard.current.iKey.wasPressedThisFrame) return true;
            var padControl = PadControlFor(action);
            return padControl != null && padControl.wasPressedThisFrame;
        }

        private static ButtonControl ControlFor(GameAction action)
        {
            var kb = Keyboard.current;
            var mouse = Mouse.current;
            switch (action)
            {
                case GameAction.Primary: return mouse != null && !IsTouching() ? mouse.leftButton : null;
                case GameAction.Secondary: return mouse != null && !IsTouching() ? mouse.rightButton : null;
            }
            if (kb == null) return null;
            switch (action)
            {
                case GameAction.Jump: return kb.spaceKey;
                case GameAction.Sprint: return kb.leftShiftKey;
                case GameAction.Interact: return kb.eKey;
                case GameAction.Rotate: return kb.rKey;
                case GameAction.Tilt: return kb.tKey;
                case GameAction.Roll: return kb.gKey;
                case GameAction.ResetTilt: return kb.hKey;
                case GameAction.BuildMode: return kb.bKey;
                case GameAction.Deconstruct: return kb.xKey;
                case GameAction.Inventory: return kb.tabKey;
                case GameAction.Scanner: return kb.cKey;
                case GameAction.QuickSave: return kb.f5Key;
                case GameAction.QuickLoad: return kb.f9Key;
                case GameAction.ToggleStats: return kb.f3Key;
                case GameAction.Pause: return kb.escapeKey;
                case GameAction.Hotbar1: return kb.digit1Key;
                case GameAction.Hotbar2: return kb.digit2Key;
                case GameAction.Hotbar3: return kb.digit3Key;
                case GameAction.Hotbar4: return kb.digit4Key;
                case GameAction.Hotbar5: return kb.digit5Key;
                case GameAction.Hotbar6: return kb.digit6Key;
                case GameAction.Hotbar7: return kb.digit7Key;
                case GameAction.Hotbar8: return kb.digit8Key;
                case GameAction.Hotbar9: return kb.digit9Key;
                default: return null;
            }
        }

        private static ButtonControl PadControlFor(GameAction action)
        {
            var pad = Gamepad.current;
            if (pad == null) return null;
            switch (action)
            {
                case GameAction.Jump: return pad.buttonSouth;
                case GameAction.Interact: return pad.buttonWest;
                case GameAction.Primary: return pad.rightTrigger;
                case GameAction.Secondary: return pad.buttonEast;
                case GameAction.Sprint: return pad.leftStickButton;
                case GameAction.Rotate: return pad.rightShoulder;
                case GameAction.BuildMode: return pad.buttonNorth;
                case GameAction.Inventory: return pad.selectButton;
                case GameAction.Pause: return pad.startButton;
                case GameAction.Scanner: return pad.leftShoulder;
                default: return null;
            }
        }

        private static bool IsTouching()
        {
            var ts = Touchscreen.current;
            return ts != null && ts.primaryTouch.press.isPressed;
        }

        public int TouchCount
        {
            get
            {
                var ts = Touchscreen.current;
                if (ts == null) return 0;
                int n = 0;
                var touches = ts.touches;
                for (int i = 0; i < touches.Count; i++)
                    if (touches[i].press.isPressed || touches[i].press.wasReleasedThisFrame) n++;
                return n;
            }
        }

        public TouchSample GetTouch(int index)
        {
            var ts = Touchscreen.current;
            int n = 0;
            var touches = ts.touches;
            for (int i = 0; i < touches.Count; i++)
            {
                var t = touches[i];
                if (!(t.press.isPressed || t.press.wasReleasedThisFrame)) continue;
                if (n == index)
                {
                    return new TouchSample
                    {
                        Id = t.touchId.ReadValue(),
                        Position = t.position.ReadValue(),
                        Began = t.press.wasPressedThisFrame,
                        Ended = t.press.wasReleasedThisFrame,
                    };
                }
                n++;
            }
            return default;
        }

        public bool PointerOverScreen => Mouse.current != null;
        public Vector2 PointerPosition => Mouse.current != null ? Mouse.current.position.ReadValue() : Vector2.zero;
    }
}
#endif

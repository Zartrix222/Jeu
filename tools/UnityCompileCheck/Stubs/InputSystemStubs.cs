// Minimal stand-ins for the Input System package API used by the game (compile check only).
// Signatures mirror com.unity.inputsystem 1.x.
using UnityEngine;

namespace UnityEngine.InputSystem.Controls
{
    public class InputControl { }
    public class ButtonControl : InputControl
    {
        public bool isPressed => false;
        public bool wasPressedThisFrame => false;
        public bool wasReleasedThisFrame => false;
    }
    public class KeyControl : ButtonControl { }
    public class Vector2Control : InputControl { public Vector2 ReadValue() => default; }
    public class DeltaControl : Vector2Control { }
    public class StickControl : Vector2Control { }
    public class IntegerControl : InputControl { public int ReadValue() => 0; }
    public class TouchPressControl : ButtonControl { }
    public class TouchControl : InputControl
    {
        public TouchPressControl press => null;
        public IntegerControl touchId => null;
        public Vector2Control position => null;
    }
}

namespace UnityEngine.InputSystem.Utilities
{
    public struct ReadOnlyArray<T>
    {
        public int Count => 0;
        public T this[int index] => default;
    }
}

namespace UnityEngine.InputSystem
{
    using UnityEngine.InputSystem.Controls;
    using UnityEngine.InputSystem.Utilities;

    public class InputDevice { }

    public class Keyboard : InputDevice
    {
        public static Keyboard current => null;
        public KeyControl wKey, aKey, sKey, dKey, eKey, rKey, tKey, gKey, hKey, bKey, xKey, cKey, iKey;
        public KeyControl upArrowKey, downArrowKey, leftArrowKey, rightArrowKey;
        public KeyControl spaceKey, leftShiftKey, tabKey, escapeKey, f3Key, f5Key, f9Key;
        public KeyControl digit1Key, digit2Key, digit3Key, digit4Key, digit5Key, digit6Key, digit7Key, digit8Key, digit9Key;
    }

    public class Mouse : InputDevice
    {
        public static Mouse current => null;
        public DeltaControl delta => null;
        public DeltaControl scroll => null;
        public Vector2Control position => null;
        public ButtonControl leftButton => null;
        public ButtonControl rightButton => null;
    }

    public class Gamepad : InputDevice
    {
        public static Gamepad current => null;
        public StickControl leftStick => null;
        public StickControl rightStick => null;
        public ButtonControl buttonSouth, buttonNorth, buttonEast, buttonWest;
        public ButtonControl rightTrigger, leftShoulder, rightShoulder, leftStickButton, selectButton, startButton;
    }

    public class Touchscreen : InputDevice
    {
        public static Touchscreen current => null;
        public TouchControl primaryTouch => null;
        public ReadOnlyArray<TouchControl> touches => default;
    }
}

using UnityEngine;

namespace Industria.Input
{
    /// <summary>
    /// Shared conversion between screen pixels and the virtual GUI space (reference height 900 px),
    /// so HUD and touch controls agree on sizes on every device.
    /// </summary>
    public static class UIScale
    {
        public const float ReferenceHeight = 900f;

        public static float Scale => Mathf.Clamp(Screen.height / ReferenceHeight, 0.6f, 4f);
        public static float Width => Screen.width / Scale;
        public static float Height => Screen.height / Scale;

        /// <summary>Screen pixel (origin bottom-left) to GUI virtual coordinates (origin top-left).</summary>
        public static Vector2 ScreenToGui(Vector2 screen) => new Vector2(screen.x / Scale, (Screen.height - screen.y) / Scale);

        public static Matrix4x4 GuiMatrix => Matrix4x4.TRS(Vector3.zero, Quaternion.identity, new Vector3(Scale, Scale, 1f));
    }
}

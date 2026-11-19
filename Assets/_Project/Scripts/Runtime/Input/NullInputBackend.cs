using UnityEngine;

namespace Industria.Input
{
    /// <summary>Used when no input API is enabled in the Player settings (should not happen).</summary>
    public sealed class NullInputBackend : IInputBackend
    {
        public Vector2 Move => Vector2.zero;
        public Vector2 Look => Vector2.zero;
        public float Zoom => 0f;
        public bool Held(GameAction action) => false;
        public bool Pressed(GameAction action) => false;
        public int TouchCount => 0;
        public TouchSample GetTouch(int index) => default;
        public bool PointerOverScreen => false;
        public Vector2 PointerPosition => Vector2.zero;
    }
}

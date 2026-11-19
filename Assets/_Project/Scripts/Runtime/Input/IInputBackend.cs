using UnityEngine;

namespace Industria.Input
{
    /// <summary>Raw touch sample, independent from the input API in use.</summary>
    public struct TouchSample
    {
        public int Id;
        /// <summary>Screen position in pixels, origin bottom-left (Unity screen space).</summary>
        public Vector2 Position;
        public bool Began;
        public bool Ended;
    }

    /// <summary>A source of player input (keyboard+mouse, gamepad, touch...).</summary>
    public interface IInputBackend
    {
        Vector2 Move { get; }
        /// <summary>Camera look delta in "degrees-ish" units for this frame.</summary>
        Vector2 Look { get; }
        float Zoom { get; }
        bool Held(GameAction action);
        bool Pressed(GameAction action);
        int TouchCount { get; }
        TouchSample GetTouch(int index);
        bool PointerOverScreen { get; }
        Vector2 PointerPosition { get; }
    }
}

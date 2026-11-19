using System.Collections.Generic;
using UnityEngine;

namespace Industria.Input
{
    /// <summary>
    /// On-screen controls for phones and tablets: a virtual joystick (left), a camera drag zone (right)
    /// and hold buttons. Works from raw touches so it does not depend on the GUI system.
    /// Rectangles are in virtual GUI space (see <see cref="UIScale"/>).
    /// </summary>
    public sealed class TouchControls
    {
        public sealed class VirtualButton
        {
            public GameAction Action;
            public string Label;
            public Rect Rect;
            public bool Held;
            public bool Pressed;
            public int FingerId = -1;
            public bool Visible = true;
        }

        private const float LookSensitivity = 0.18f;
        private const float JoystickRadius = 70f;

        private readonly List<VirtualButton> _buttons = new List<VirtualButton>();
        private readonly HashSet<int> _seen = new HashSet<int>();
        private int _joystickFinger = -1;
        private Vector2 _joystickOrigin;
        private Vector2 _joystickKnob;
        private int _lookFinger = -1;
        private Vector2 _lookLast;

        public bool Enabled { get; set; }
        public Vector2 Move { get; private set; }
        public Vector2 Look { get; private set; }
        public IReadOnlyList<VirtualButton> Buttons => _buttons;
        public bool JoystickActive => _joystickFinger >= 0;
        public Vector2 JoystickOrigin => _joystickOrigin;
        public Vector2 JoystickKnob => _joystickKnob;
        public float JoystickRadiusGui => JoystickRadius;
        /// <summary>Sprint is a toggle on touch screens.</summary>
        public bool SprintToggled { get; set; }

        public TouchControls()
        {
            Add(GameAction.Jump, "SAUT");
            Add(GameAction.Primary, "ACTION");
            Add(GameAction.Interact, "UTILISER");
            Add(GameAction.Sprint, "COURIR");
            Add(GameAction.BuildMode, "CONSTR.");
            Add(GameAction.Rotate, "PIVOTER");
            Add(GameAction.Secondary, "ANNULER");
            Add(GameAction.Deconstruct, "DÉMOLIR");
            Add(GameAction.Scanner, "SCAN");
            Add(GameAction.Inventory, "INVENT.");
            Add(GameAction.Pause, "MENU");
        }

        private void Add(GameAction action, string label) => _buttons.Add(new VirtualButton { Action = action, Label = label });

        /// <summary>Computes button rectangles for the current screen size.</summary>
        public void Layout()
        {
            float w = UIScale.Width, h = UIScale.Height;
            float s = 78f, gap = 10f;
            // Main cluster bottom-right (2 rows x 3).
            Place(GameAction.Primary, w - s * 1.4f - gap, h - s * 1.4f - gap, s * 1.4f, s * 1.4f);
            Place(GameAction.Jump, w - s * 2.4f - gap * 2, h - s - gap, s, s);
            Place(GameAction.Interact, w - s * 2.4f - gap * 2, h - s * 2 - gap * 2, s, s);
            Place(GameAction.Sprint, w - s * 3.4f - gap * 3, h - s - gap, s, s);
            Place(GameAction.Rotate, w - s * 1.4f - gap, h - s * 2.4f - gap * 2, s * 0.7f, s * 0.7f);
            Place(GameAction.Secondary, w - s * 0.7f - gap, h - s * 2.4f - gap * 2, s * 0.7f, s * 0.7f);
            // Top-right utility row.
            float u = 64f;
            Place(GameAction.Pause, w - u - gap, gap, u, u * 0.7f);
            Place(GameAction.Inventory, w - (u + gap) * 2, gap, u, u * 0.7f);
            Place(GameAction.Scanner, w - (u + gap) * 3, gap, u, u * 0.7f);
            Place(GameAction.Deconstruct, w - (u + gap) * 4, gap, u, u * 0.7f);
            Place(GameAction.BuildMode, w - (u + gap) * 5, gap, u, u * 0.7f);
        }

        private void Place(GameAction action, float x, float y, float width, float height)
        {
            foreach (var b in _buttons) if (b.Action == action) b.Rect = new Rect(x, y, width, height);
        }

        public bool IsOverButton(Vector2 gui)
        {
            foreach (var b in _buttons) if (b.Visible && b.Rect.Contains(gui)) return true;
            return false;
        }

        public void Update(IInputBackend backend)
        {
            Move = Vector2.zero;
            Look = Vector2.zero;
            foreach (var b in _buttons) b.Pressed = false;
            if (!Enabled || backend == null) return;

            Layout();
            int count = backend.TouchCount;
            var seen = _seen;
            seen.Clear();
            for (int i = 0; i < count; i++)
            {
                var t = backend.GetTouch(i);
                seen.Add(t.Id);
                var gui = UIScale.ScreenToGui(t.Position);

                if (t.Began)
                {
                    var button = ButtonAt(gui);
                    if (button != null)
                    {
                        button.FingerId = t.Id;
                        button.Held = true;
                        button.Pressed = true;
                        if (button.Action == GameAction.Sprint) SprintToggled = !SprintToggled;
                    }
                    else if (gui.x < UIScale.Width * 0.4f && gui.y > UIScale.Height * 0.35f && _joystickFinger < 0)
                    {
                        _joystickFinger = t.Id;
                        _joystickOrigin = gui;
                        _joystickKnob = gui;
                    }
                    else if (_lookFinger < 0)
                    {
                        _lookFinger = t.Id;
                        _lookLast = t.Position;
                    }
                }

                if (t.Id == _joystickFinger)
                {
                    var delta = Vector2.ClampMagnitude(gui - _joystickOrigin, JoystickRadius);
                    _joystickKnob = _joystickOrigin + delta;
                    Move = new Vector2(delta.x, -delta.y) / JoystickRadius;
                    if (t.Ended) _joystickFinger = -1;
                }
                else if (t.Id == _lookFinger)
                {
                    Look = (t.Position - _lookLast) * LookSensitivity;
                    _lookLast = t.Position;
                    if (t.Ended) _lookFinger = -1;
                }

                if (t.Ended)
                {
                    foreach (var b in _buttons)
                        if (b.FingerId == t.Id) { b.FingerId = -1; b.Held = false; }
                }
            }

            // Release anything whose finger vanished without an "ended" event.
            if (_joystickFinger >= 0 && !seen.Contains(_joystickFinger)) _joystickFinger = -1;
            if (_lookFinger >= 0 && !seen.Contains(_lookFinger)) _lookFinger = -1;
            foreach (var b in _buttons)
                if (b.FingerId >= 0 && !seen.Contains(b.FingerId)) { b.FingerId = -1; b.Held = false; }
        }

        private VirtualButton ButtonAt(Vector2 gui)
        {
            foreach (var b in _buttons) if (b.Visible && b.Rect.Contains(gui)) return b;
            return null;
        }

        public bool Held(GameAction action)
        {
            if (!Enabled) return false;
            if (action == GameAction.Sprint) return SprintToggled;
            foreach (var b in _buttons) if (b.Action == action && b.Held) return true;
            return false;
        }

        public bool Pressed(GameAction action)
        {
            if (!Enabled) return false;
            foreach (var b in _buttons) if (b.Action == action && b.Pressed) return true;
            return false;
        }
    }
}

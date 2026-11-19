using Industria.Building;
using Industria.Core;
using Industria.Input;
using UnityEngine;

namespace Industria.UI
{
    /// <summary>Draws the on-screen joystick and buttons (input is handled by <see cref="TouchControls"/>).</summary>
    public sealed class HudTouchView
    {
        private readonly GameRoot _root;
        public HudTouchView(GameRoot root) { _root = root; }

        public void Draw()
        {
            var touch = _root.Input.Touch;
            touch.Layout();
            bool building = _root.Build.IsActive;
            foreach (var b in touch.Buttons)
            {
                b.Visible = b.Action != GameAction.Rotate || (building && _root.Build.Tool == BuildTool.Place);
                if (!b.Visible) continue;
                var bg = b.Held ? new Color(0.98f, 0.58f, 0.15f, 0.75f) : new Color(0.05f, 0.07f, 0.09f, 0.55f);
                if (b.Action == GameAction.Sprint && touch.SprintToggled) bg = new Color(0.98f, 0.58f, 0.15f, 0.55f);
                UIStyles.Fill(b.Rect, bg);
                UIStyles.Frame(b.Rect, new Color(1f, 1f, 1f, 0.3f), 1f);
                string label = b.Action == GameAction.Primary ? (building ? (_root.Build.Tool == BuildTool.Deconstruct ? "DÉMOLIR" : "PLACER") : "MINER") : b.Label;
                GUI.Label(b.Rect, label, new GUIStyle(UIStyles.Center) { fontSize = 13, fontStyle = FontStyle.Bold });
            }

            if (touch.JoystickActive)
            {
                float r = touch.JoystickRadiusGui;
                var o = touch.JoystickOrigin;
                var old = GUI.color;
                GUI.color = new Color(1f, 1f, 1f, 0.35f);
                GUI.DrawTexture(new Rect(o.x - r, o.y - r, r * 2f, r * 2f), UIStyles.RingTex);
                GUI.color = new Color(0.98f, 0.58f, 0.15f, 0.8f);
                var k = touch.JoystickKnob;
                GUI.DrawTexture(new Rect(k.x - 26f, k.y - 26f, 52f, 52f), UIStyles.RingTex);
                GUI.color = old;
            }
            else
            {
                GUI.Label(new Rect(30f, UIScale.Height - 130f, 220f, 40f), "Glissez ici pour vous déplacer", UIStyles.Small);
            }
        }
    }
}

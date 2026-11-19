using Industria.Rendering;
using UnityEngine;

namespace Industria.UI
{
    /// <summary>Futuristic dark / orange IMGUI skin, generated at runtime (no assets needed).</summary>
    public static class UIStyles
    {
        public static readonly Color Accent = new Color(0.98f, 0.58f, 0.15f);
        public static readonly Color AccentDim = new Color(0.98f, 0.58f, 0.15f, 0.35f);
        public static readonly Color Panel = new Color(0.05f, 0.07f, 0.09f, 0.86f);
        public static readonly Color PanelLight = new Color(0.12f, 0.15f, 0.18f, 0.92f);
        public static readonly Color Text = new Color(0.9f, 0.93f, 0.95f);
        public static readonly Color TextDim = new Color(0.6f, 0.65f, 0.7f);
        public static readonly Color Good = new Color(0.35f, 0.9f, 0.5f);
        public static readonly Color Bad = new Color(1f, 0.38f, 0.32f);
        public static readonly Color Info = new Color(0.35f, 0.75f, 1f);

        private static bool _ready;
        public static GUIStyle Title, Header, Label, Small, Center, Button, BigButton, Box, Slot, Prompt;
        public static Texture2D White, PanelTex, PanelLightTex, AccentTex, RingTex;

        public static void Ensure()
        {
            if (_ready && White != null) return;
            _ready = true;
            White = ProceduralTextures.Solid(Color.white);
            PanelTex = ProceduralTextures.Solid(Panel);
            PanelLightTex = ProceduralTextures.Solid(PanelLight);
            AccentTex = ProceduralTextures.Solid(Accent);
            RingTex = ProceduralTextures.Ring();

            Label = new GUIStyle(GUI.skin.label) { fontSize = 16, wordWrap = true, richText = true };
            Label.normal.textColor = Text;
            Small = new GUIStyle(Label) { fontSize = 13 };
            Small.normal.textColor = TextDim;
            Header = new GUIStyle(Label) { fontSize = 20, fontStyle = FontStyle.Bold };
            Header.normal.textColor = Accent;
            Title = new GUIStyle(Label) { fontSize = 54, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter, wordWrap = false };
            Title.normal.textColor = Color.white;
            Center = new GUIStyle(Label) { alignment = TextAnchor.MiddleCenter };
            Prompt = new GUIStyle(Center) { fontSize = 17, fontStyle = FontStyle.Bold };

            Box = new GUIStyle(GUI.skin.box) { padding = new RectOffset(14, 14, 12, 12) };
            Box.normal.background = PanelTex;

            Slot = new GUIStyle(GUI.skin.box) { fontSize = 13, alignment = TextAnchor.LowerRight, padding = new RectOffset(4, 6, 4, 4) };
            Slot.normal.background = PanelLightTex;
            Slot.normal.textColor = Text;

            Button = new GUIStyle(GUI.skin.button) { fontSize = 16, fontStyle = FontStyle.Bold, padding = new RectOffset(10, 10, 8, 8) };
            Button.normal.background = PanelLightTex;
            Button.normal.textColor = Text;
            Button.hover.background = ProceduralTextures.Solid(new Color(0.2f, 0.24f, 0.28f, 0.95f));
            Button.hover.textColor = Accent;
            Button.active.background = AccentTex;
            Button.active.textColor = Color.black;
            BigButton = new GUIStyle(Button) { fontSize = 22, fixedHeight = 0 };
        }

        public static void Fill(Rect r, Color c)
        {
            var old = GUI.color;
            GUI.color = c;
            GUI.DrawTexture(r, White);
            GUI.color = old;
        }

        public static void Frame(Rect r, Color c, float thickness = 2f)
        {
            Fill(new Rect(r.x, r.y, r.width, thickness), c);
            Fill(new Rect(r.x, r.yMax - thickness, r.width, thickness), c);
            Fill(new Rect(r.x, r.y, thickness, r.height), c);
            Fill(new Rect(r.xMax - thickness, r.y, thickness, r.height), c);
        }

        public static void PanelBox(Rect r)
        {
            GUI.Box(r, GUIContent.none, Box);
            Fill(new Rect(r.x, r.y, r.width, 3f), Accent);
        }

        public static void ProgressBar(Rect r, float value, Color color)
        {
            Fill(r, new Color(0f, 0f, 0f, 0.5f));
            Fill(new Rect(r.x, r.y, r.width * Mathf.Clamp01(value), r.height), color);
        }

        public static string Colorize(string text, Color c) => $"<color=#{ColorUtility.ToHtmlStringRGB(c)}>{text}</color>";
    }
}

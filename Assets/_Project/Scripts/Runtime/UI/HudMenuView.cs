using Industria.Core;
using Industria.Input;
using UnityEngine;

namespace Industria.UI
{
    /// <summary>Main menu and pause menu.</summary>
    public sealed class HudMenuView
    {
        private readonly GameRoot _root;
        private bool _confirmNewGame;

        public HudMenuView(GameRoot root) { _root = root; }

        public void DrawMainMenu()
        {
            float w = UIScale.Width, h = UIScale.Height;
            UIStyles.Fill(new Rect(0f, 0f, w, h), new Color(0f, 0.02f, 0.04f, 0.35f));
            GUI.Label(new Rect(0f, h * 0.18f, w, 70f), GameInfo.Title, UIStyles.Title);
            GUI.Label(new Rect(0f, h * 0.18f + 72f, w, 30f), UIStyles.Colorize($"Planète {GameInfo.Planet}  ·  version {GameInfo.Version}", UIStyles.Accent), UIStyles.Center);

            float bw = 340f, bh = 58f, x = w * 0.5f - bw * 0.5f, y = h * 0.45f;
            bool hasSave = _root.Saves.Exists();

            if (_confirmNewGame)
            {
                GUI.Label(new Rect(x - 80f, y, bw + 160f, 50f), "Une sauvegarde existe déjà. Elle sera remplacée à la prochaine sauvegarde. Continuer ?", UIStyles.Center);
                if (GUI.Button(new Rect(x, y + 60f, bw, bh), "Oui, nouvelle partie", UIStyles.BigButton)) { _confirmNewGame = false; _root.StartNewGame(); }
                if (GUI.Button(new Rect(x, y + 130f, bw, bh), "Annuler", UIStyles.BigButton)) _confirmNewGame = false;
                return;
            }

            if (hasSave)
            {
                if (GUI.Button(new Rect(x, y, bw, bh), "Continuer", UIStyles.BigButton)) _root.ContinueGame();
                y += bh + 14f;
            }
            if (GUI.Button(new Rect(x, y, bw, bh), "Nouvelle partie", UIStyles.BigButton))
            {
                if (hasSave) _confirmNewGame = true; else _root.StartNewGame();
            }
            y += bh + 14f;
            if (!Application.isMobilePlatform && GUI.Button(new Rect(x, y, bw, bh), "Quitter", UIStyles.BigButton)) _root.Quit();

            GUI.Label(new Rect(0f, h - 40f, w, 24f), "Solo · hors ligne · sauvegarde locale", new GUIStyle(UIStyles.Small) { alignment = TextAnchor.MiddleCenter });
        }

        public void DrawPause()
        {
            float w = UIScale.Width, h = UIScale.Height;
            UIStyles.Fill(new Rect(0f, 0f, w, h), new Color(0f, 0f, 0f, 0.45f));
            var r = new Rect(w * 0.5f - 200f, h * 0.5f - 230f, 400f, 460f);
            UIStyles.PanelBox(r);
            GUI.Label(new Rect(r.x, r.y + 18f, r.width, 30f), "PAUSE", new GUIStyle(UIStyles.Header) { alignment = TextAnchor.MiddleCenter });
            float x = r.x + 40f, bw = r.width - 80f, bh = 50f, y = r.y + 70f;
            if (GUI.Button(new Rect(x, y, bw, bh), "Reprendre", UIStyles.BigButton)) _root.Hud.CloseAll();
            y += bh + 12f;
            if (GUI.Button(new Rect(x, y, bw, bh), "Sauvegarder", UIStyles.BigButton)) _root.SaveGame();
            y += bh + 12f;
            GUI.enabled = _root.Saves.Exists();
            if (GUI.Button(new Rect(x, y, bw, bh), "Charger la sauvegarde", UIStyles.BigButton)) { _root.Hud.CloseAll(); _root.ContinueGame(); }
            GUI.enabled = true;
            y += bh + 12f;
            if (GUI.Button(new Rect(x, y, bw, bh), "Sauver et menu principal", UIStyles.BigButton)) { _root.SaveGame(); _root.ReturnToMainMenu(); }
            y += bh + 12f;
            if (!Application.isMobilePlatform && GUI.Button(new Rect(x, y, bw, bh), "Sauver et quitter", UIStyles.BigButton)) { _root.SaveGame(); _root.Quit(); }
            GUI.Label(new Rect(r.x, r.yMax - 34f, r.width, 22f), $"Temps de jeu : {System.TimeSpan.FromSeconds(_root.PlayTime):hh\\:mm\\:ss}", new GUIStyle(UIStyles.Small) { alignment = TextAnchor.MiddleCenter });
        }
    }
}

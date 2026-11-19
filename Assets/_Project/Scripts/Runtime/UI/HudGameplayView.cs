using Industria.Building;
using Industria.Core;
using Industria.Input;
using Industria.Scanner;
using UnityEngine;

namespace Industria.UI
{
    /// <summary>Always-on HUD: crosshair, prompts, hotbar, objectives, notifications, scanner markers.</summary>
    public sealed class HudGameplayView
    {
        private readonly GameRoot _root;

        public HudGameplayView(GameRoot root) { _root = root; }

        public void Draw(bool interactive)
        {
            float w = UIScale.Width, h = UIScale.Height;
            DrawScanner(w, h);
            DrawTopLeft();
            DrawNotifications(w, h);
            DrawHotbar(w, h, interactive);
            if (!interactive) return;
            DrawCrosshair(w, h);
            DrawPrompt(w, h);
        }

        private void DrawCrosshair(float w, float h)
        {
            var c = new Vector2(w * 0.5f, h * 0.5f);
            var color = _root.Build.IsActive ? (_root.Build.PlacementValid ? UIStyles.Info : UIStyles.Bad) : new Color(1f, 1f, 1f, 0.85f);
            UIStyles.Fill(new Rect(c.x - 9f, c.y - 1f, 6f, 2f), color);
            UIStyles.Fill(new Rect(c.x + 3f, c.y - 1f, 6f, 2f), color);
            UIStyles.Fill(new Rect(c.x - 1f, c.y - 9f, 2f, 6f), color);
            UIStyles.Fill(new Rect(c.x - 1f, c.y + 3f, 2f, 6f), color);

            var interactor = _root.Interactor;
            if (interactor.IsMining)
                UIStyles.ProgressBar(new Rect(c.x - 40f, c.y + 16f, 80f, 6f), interactor.MineProgress, UIStyles.Accent);
        }

        private void DrawPrompt(float w, float h)
        {
            string text;
            var build = _root.Build;
            if (build.IsActive)
            {
                text = BuildPrompt(build);
            }
            else
            {
                text = _root.Interactor.Prompt;
            }
            if (string.IsNullOrEmpty(text)) return;
            var r = new Rect(w * 0.5f - 330f, h * 0.5f + 30f, 660f, 60f);
            GUI.Label(r, text, UIStyles.Prompt);
        }

        private string BuildPrompt(BuildModeController build)
        {
            if (build.Tool == BuildTool.Deconstruct)
            {
                string m = build.Message ?? "";
                return UIStyles.Colorize("MODE DÉMOLITION", UIStyles.Bad) + "\n" + m + (build.DeconstructTarget != null ? "  [Clic] démolir" : "") + "   [X] quitter";
            }
            var def = build.Selected;
            if (def == null) return null;
            string status = build.Message == null ? "" : (build.PlacementValid ? UIStyles.Colorize(build.Message, UIStyles.Good) : UIStyles.Colorize(build.Message, UIStyles.Bad));
            string cost = ItemFormatting.Cost(_root.Content.Items, build.CurrentCost, _root.PlayerInventory);
            string keys = def.IsConveyor
                ? (build.HasBeltStart ? "[Clic] poser   [Clic droit] annuler le départ" : "[Clic] fixer le départ   [Clic droit] quitter")
                : "[Clic] placer   [R / molette] pivoter" + (def.allowTilt ? "   [T/G] incliner  [H] réinit." : "") + "   [Clic droit] quitter";
            return $"{UIStyles.Colorize(def.displayName.ToUpperInvariant(), UIStyles.Accent)}  {status}\n{cost}\n<size=13>{keys}</size>";
        }

        private void DrawTopLeft()
        {
            var r = new Rect(16f, 16f, 520f, 150f);
            var era = _root.Content.Eras.Count > 0 ? _root.Content.Eras[0] : null;
            GUI.Label(new Rect(r.x, r.y, r.width, 26f), $"{GameInfo.Planet}  ·  Ère {(era != null ? era.index : 1)} — {(era != null ? era.displayName : "Survie")}  ·  {_root.DayNight.ClockText}", UIStyles.Header);

            var tracker = _root.Objectives;
            var current = tracker.Current;
            float y = r.y + 32f;
            if (current != null)
            {
                GUI.Label(new Rect(r.x, y, r.width, 22f), $"OBJECTIF {tracker.CompletedCount + 1}/{tracker.All.Count}", UIStyles.Small);
                GUI.Label(new Rect(r.x, y + 18f, r.width, 44f), current.Title, UIStyles.Label);
                GUI.Label(new Rect(r.x, y + 42f, r.width, 40f), current.Hint, UIStyles.Small);
            }
            else
            {
                GUI.Label(new Rect(r.x, y, r.width, 40f), UIStyles.Colorize("Tous les objectifs de l'ère accomplis !", UIStyles.Good), UIStyles.Label);
            }
            if (!_root.Input.Touch.Enabled)
                GUI.Label(new Rect(r.x, y + 84f, r.width + 200f, 22f), "[Tab] Inventaire  [C] Scanner  [B] Construire  [X] Démolir  [F5] Sauver  [F3] Perf.  [Échap] Menu", UIStyles.Small);
        }

        private void DrawHotbar(float w, float h, bool interactive)
        {
            var list = _root.Content.Buildables;
            int n = Mathf.Min(list.Count, 9);
            if (n == 0) return;
            float slotW = 132f, slotH = 64f, gap = 8f;
            float total = n * slotW + (n - 1) * gap;
            float x0 = w * 0.5f - total * 0.5f;
            float y = h - slotH - 14f;
            if (_root.Input.Touch.Enabled) { x0 = Mathf.Max(260f, x0); y = h - slotH - 10f; }

            for (int i = 0; i < n; i++)
            {
                var def = list[i];
                var r = new Rect(x0 + i * (slotW + gap), y, slotW, slotH);
                bool selected = _root.Build.Tool == BuildTool.Place && _root.Build.Selected == def;
                bool affordable = _root.PlayerInventory.HasAll(Simulation.Content.ContentDatabase.ComputeCost(def, def.costPerMeters));
                UIStyles.Fill(r, selected ? new Color(0.25f, 0.15f, 0.04f, 0.92f) : UIStyles.Panel);
                UIStyles.Frame(r, selected ? UIStyles.Accent : new Color(1f, 1f, 1f, 0.12f), selected ? 2f : 1f);
                GUI.Label(new Rect(r.x + 6f, r.y + 2f, 20f, 20f), (i + 1).ToString(), UIStyles.Small);
                var nameStyle = new GUIStyle(UIStyles.Label) { fontSize = 14, alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold };
                nameStyle.normal.textColor = affordable ? UIStyles.Text : UIStyles.TextDim;
                GUI.Label(new Rect(r.x + 4f, r.y + 6f, r.width - 8f, r.height - 22f), def.displayName, nameStyle);
                GUI.Label(new Rect(r.x + 4f, r.yMax - 20f, r.width - 8f, 18f), affordable ? UIStyles.Colorize("disponible", UIStyles.Good) : UIStyles.Colorize("ressources ?", UIStyles.Bad),
                    new GUIStyle(UIStyles.Small) { alignment = TextAnchor.MiddleCenter, fontSize = 11 });

                if (interactive && GUI.Button(r, GUIContent.none, GUIStyle.none))
                {
                    if (selected) _root.Build.Exit(); else _root.Build.Select(def);
                }
            }
        }

        private void DrawNotifications(float w, float h)
        {
            var entries = _root.Notifications.Entries;
            float y = h - 110f;
            for (int i = entries.Count - 1; i >= 0; i--)
            {
                var e = entries[i];
                var color = e.Kind == NotificationKind.Success ? UIStyles.Good : e.Kind == NotificationKind.Warning ? UIStyles.Bad : UIStyles.Text;
                string text = e.Count > 1 ? $"{e.Text}  ×{e.Count}" : e.Text;
                float alpha = Mathf.Clamp01(e.ExpiresAt - Time.unscaledTime);
                var r = new Rect(w - 420f, y - 30f, 400f, 28f);
                UIStyles.Fill(r, new Color(0f, 0f, 0f, 0.45f * alpha));
                UIStyles.Fill(new Rect(r.x, r.y, 3f, r.height), new Color(color.r, color.g, color.b, alpha));
                var style = new GUIStyle(UIStyles.Label) { alignment = TextAnchor.MiddleLeft, fontSize = 15 };
                style.normal.textColor = new Color(color.r, color.g, color.b, alpha);
                GUI.Label(new Rect(r.x + 10f, r.y, r.width - 12f, r.height), text, style);
                y -= 32f;
            }
        }

        private void DrawScanner(float w, float h)
        {
            var scanner = _root.Scanner;
            var cam = _root.CameraRig.Camera;
            if (scanner.PulseActive)
            {
                float t = (Time.time - scanner.PulseStartedAt) / ScannerSystem.PulseDuration;
                float size = Mathf.Lerp(40f, Mathf.Max(w, h) * 1.4f, t);
                var old = GUI.color;
                GUI.color = new Color(0.4f, 0.85f, 1f, 1f - t);
                GUI.DrawTexture(new Rect(w * 0.5f - size * 0.5f, h * 0.5f - size * 0.5f, size, size), UIStyles.RingTex);
                GUI.color = old;
            }
            if (cam == null) return;
            var player = _root.Player.transform.position;
            foreach (var m in scanner.Markers)
            {
                if (m.Node == null) continue;
                var world = m.Node.transform.position + Vector3.up * 3f;
                var sp = cam.WorldToScreenPoint(world);
                if (sp.z <= 0f) continue;
                var gui = UIScale.ScreenToGui(new Vector2(sp.x, sp.y));
                var color = ItemFormatting.ItemColor(_root.Content.Items, m.Node.ItemId);
                float dist = Vector3.Distance(player, m.Node.transform.position);
                var diamond = new Rect(gui.x - 7f, gui.y - 7f, 14f, 14f);
                var matrix = GUI.matrix;
                GUIUtility.RotateAroundPivot(45f, gui * UIScale.Scale);
                UIStyles.Fill(diamond, color);
                GUI.matrix = matrix;
                string label = $"{_root.Content.Items.NameOf(m.Node.ItemId)} · {m.Node.PurityLabel}\n{dist:F0} m";
                var style = new GUIStyle(UIStyles.Small) { alignment = TextAnchor.UpperCenter, fontSize = 12 };
                style.normal.textColor = Color.white;
                GUI.Label(new Rect(gui.x - 80f, gui.y + 9f, 160f, 36f), label, style);
            }
        }
    }
}

using Industria.Core;
using Industria.Input;
using UnityEngine;

namespace Industria.UI
{
    public sealed class HudInventoryView
    {
        private readonly GameRoot _root;
        public HudInventoryView(GameRoot root) { _root = root; }

        public void Draw()
        {
            float w = UIScale.Width, h = UIScale.Height;
            const int columns = 6;
            float slot = 92f, gap = 8f;
            var inv = _root.PlayerInventory;
            int rows = Mathf.CeilToInt(inv.SlotCount / (float)columns);
            float pw = columns * slot + (columns - 1) * gap + 40f;
            float ph = rows * slot + (rows - 1) * gap + 120f;
            var r = new Rect(w * 0.5f - pw * 0.5f, h * 0.5f - ph * 0.5f, pw, ph);
            UIStyles.PanelBox(r);
            GUI.Label(new Rect(r.x + 20f, r.y + 14f, 300f, 28f), "INVENTAIRE", UIStyles.Header);
            if (GUI.Button(new Rect(r.xMax - 120f, r.y + 12f, 100f, 34f), "Fermer", UIStyles.Button)) _root.Hud.CloseAll();

            var items = _root.Content.Items;
            for (int i = 0; i < inv.SlotCount; i++)
            {
                int cx = i % columns, cy = i / columns;
                var sr = new Rect(r.x + 20f + cx * (slot + gap), r.y + 60f + cy * (slot + gap), slot, slot);
                UIStyles.Fill(sr, UIStyles.PanelLight);
                var s = inv.GetSlot(i);
                if (s.count <= 0) continue;
                var color = ItemFormatting.ItemColor(items, s.itemId);
                UIStyles.Fill(new Rect(sr.x + 22f, sr.y + 12f, 48f, 36f), color);
                UIStyles.Frame(new Rect(sr.x + 22f, sr.y + 12f, 48f, 36f), new Color(1f, 1f, 1f, 0.25f), 1f);
                GUI.Label(new Rect(sr.x + 2f, sr.y + 50f, slot - 4f, 22f), items.NameOf(s.itemId), new GUIStyle(UIStyles.Small) { alignment = TextAnchor.MiddleCenter, fontSize = 11 });
                GUI.Label(new Rect(sr.x, sr.y + 66f, slot - 6f, 24f), s.count.ToString(), new GUIStyle(UIStyles.Label) { alignment = TextAnchor.MiddleRight, fontStyle = FontStyle.Bold });
            }
            GUI.Label(new Rect(r.x + 20f, r.yMax - 40f, pw - 40f, 24f),
                "Minez les gisements, fondez le minerai, puis automatisez avec foreuses et convoyeurs.", UIStyles.Small);
        }
    }
}

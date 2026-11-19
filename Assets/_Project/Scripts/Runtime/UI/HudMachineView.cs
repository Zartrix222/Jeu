using System.Collections.Generic;
using Industria.Core;
using Industria.Factory;
using Industria.Input;
using Industria.Simulation.Factory;
using UnityEngine;

namespace Industria.UI
{
    /// <summary>Machine panel: status, progress, recipe, buffers and manual transfers.</summary>
    public sealed class HudMachineView
    {
        private readonly GameRoot _root;
        public HudMachineView(GameRoot root) { _root = root; }

        public void Draw(BuildingView building)
        {
            if (building == null || building.Machine == null) return;
            var machine = building.Machine;
            var def = building.Definition;
            float w = UIScale.Width, h = UIScale.Height;
            var r = new Rect(w * 0.5f - 330f, h * 0.5f - 250f, 660f, 500f);
            UIStyles.PanelBox(r);

            GUI.Label(new Rect(r.x + 20f, r.y + 14f, 460f, 28f), def.displayName.ToUpperInvariant(), UIStyles.Header);
            if (GUI.Button(new Rect(r.xMax - 120f, r.y + 12f, 100f, 34f), "Fermer", UIStyles.Button)) { _root.Hud.CloseAll(); return; }
            GUI.Label(new Rect(r.x + 20f, r.y + 46f, r.width - 40f, 40f), def.description, UIStyles.Small);

            float y = r.y + 90f;
            GUI.Label(new Rect(r.x + 20f, y, 400f, 24f), "État : " + ItemFormatting.Status(machine.Status), UIStyles.Label);
            UIStyles.ProgressBar(new Rect(r.x + 20f, y + 28f, r.width - 40f, 10f), machine.Progress01, UIStyles.Accent);
            y += 52f;

            if (machine is ExtractorMachine ex)
            {
                string purity = building.Node != null ? building.Node.PurityLabel : "?";
                GUI.Label(new Rect(r.x + 20f, y, r.width - 40f, 24f),
                    $"Ressource : {_root.Content.Items.NameOf(ex.ResourceItemId)} (gisement {purity}) — {ex.ItemsPerMinute:F0} / min", UIStyles.Label);
                y += 34f;
            }
            else if (machine is ProcessorMachine pm)
            {
                y = DrawRecipes(pm, r, y);
            }

            y = DrawSlots("ENTRÉES", machine.InputSlots, r, y);
            y = DrawSlots("SORTIES", machine.OutputSlots, r, y);

            // Actions
            var inv = _root.PlayerInventory;
            float by = r.yMax - 60f, bw = (r.width - 60f) / 3f;
            GUI.enabled = machine.InputSlots.Count > 0 || machine is ProcessorMachine;
            if (GUI.Button(new Rect(r.x + 20f, by, bw, 42f), "Déposer", UIStyles.Button))
            {
                int moved = machine.InsertFromInventory(inv);
                _root.Notifications.Push(moved > 0 ? $"{moved} objet(s) déposé(s)" : "Rien à déposer pour cette machine", moved > 0 ? NotificationKind.Info : NotificationKind.Warning, 2f);
            }
            GUI.enabled = true;
            if (GUI.Button(new Rect(r.x + 30f + bw, by, bw, 42f), "Récupérer production", UIStyles.Button))
            {
                int moved = machine.CollectOutputs(inv);
                _root.Notifications.Push(moved > 0 ? $"{moved} objet(s) récupéré(s)" : "Rien à récupérer", NotificationKind.Info, 2f);
            }
            if (GUI.Button(new Rect(r.x + 40f + bw * 2f, by, bw, 42f), "Tout vider", UIStyles.Button))
            {
                int moved = machine.CollectAll(inv);
                _root.Notifications.Push($"{moved} objet(s) récupéré(s)", NotificationKind.Info, 2f);
            }
        }

        private float DrawRecipes(ProcessorMachine pm, Rect r, float y)
        {
            GUI.Label(new Rect(r.x + 20f, y, 200f, 24f), "RECETTE", UIStyles.Small);
            var recipes = _root.Content.Recipes.ForMachine(pm.MachineType);
            float x = r.x + 20f;
            y += 22f;
            foreach (var recipe in recipes)
            {
                bool selected = pm.Recipe == recipe;
                var br = new Rect(x, y, 200f, 36f);
                if (selected) UIStyles.Fill(new Rect(br.x - 2f, br.y - 2f, br.width + 4f, br.height + 4f), UIStyles.Accent);
                if (GUI.Button(br, recipe.displayName, UIStyles.Button) && !selected)
                {
                    if (!pm.SetRecipe(recipe)) _root.Notifications.Push("Videz la machine avant de changer de recette (« Tout vider »)", NotificationKind.Warning, 3f);
                }
                x += 210f;
            }
            y += 44f;
            if (pm.Recipe != null)
            {
                var rec = pm.Recipe;
                string inStr = string.Join(" + ", System.Array.ConvertAll(rec.inputs, s => $"{s.count} {_root.Content.Items.NameOf(s.itemId)}"));
                string outStr = string.Join(" + ", System.Array.ConvertAll(rec.outputs, s => $"{s.count} {_root.Content.Items.NameOf(s.itemId)}"));
                GUI.Label(new Rect(r.x + 20f, y, r.width - 40f, 24f), $"{inStr}  →  {outStr}   ({rec.duration:0.#} s)", UIStyles.Label);
                y += 30f;
            }
            return y;
        }

        private float DrawSlots(string title, IReadOnlyList<MachineSlot> slots, Rect r, float y)
        {
            if (slots.Count == 0) return y;
            GUI.Label(new Rect(r.x + 20f, y, 200f, 22f), title, UIStyles.Small);
            y += 22f;
            float x = r.x + 20f;
            foreach (var s in slots)
            {
                var sr = new Rect(x, y, 200f, 44f);
                UIStyles.Fill(sr, UIStyles.PanelLight);
                UIStyles.Fill(new Rect(sr.x + 6f, sr.y + 8f, 28f, 28f), ItemFormatting.ItemColor(_root.Content.Items, s.ItemId));
                GUI.Label(new Rect(sr.x + 42f, sr.y + 2f, 150f, 22f), _root.Content.Items.NameOf(s.ItemId), UIStyles.Small);
                GUI.Label(new Rect(sr.x + 42f, sr.y + 20f, 150f, 22f), $"{s.Count} / {s.Capacity}", UIStyles.Label);
                x += 210f;
            }
            return y + 54f;
        }
    }
}

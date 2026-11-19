using System.Text;
using Industria.Rendering;
using Industria.Simulation.Factory;
using Industria.Simulation.Items;
using UnityEngine;

namespace Industria.UI
{
    public static class ItemFormatting
    {
        public static string Cost(ItemRegistry items, ItemStack[] cost, Inventory inventory)
        {
            if (cost == null || cost.Length == 0) return "Gratuit";
            var sb = new StringBuilder();
            for (int i = 0; i < cost.Length; i++)
            {
                if (i > 0) sb.Append("  ");
                bool ok = inventory == null || inventory.Has(cost[i].itemId, cost[i].count);
                string text = $"{cost[i].count} {items.NameOf(cost[i].itemId)}";
                sb.Append(UIStyles.Colorize(text, ok ? UIStyles.Text : UIStyles.Bad));
            }
            return sb.ToString();
        }

        public static Color ItemColor(ItemRegistry items, string id)
            => items.TryGet(id, out var def) ? PartBuilder.Hex(def.color, Color.gray) : Color.gray;

        public static string Status(MachineStatus status)
        {
            switch (status)
            {
                case MachineStatus.Working: return UIStyles.Colorize("En production", UIStyles.Good);
                case MachineStatus.OutputFull: return UIStyles.Colorize("Sortie pleine", UIStyles.Bad);
                case MachineStatus.NoInput: return UIStyles.Colorize("En attente d'ingrédients", UIStyles.Accent);
                case MachineStatus.NoRecipe: return UIStyles.Colorize("Aucune recette", UIStyles.Accent);
                default: return UIStyles.Colorize("Inactive", UIStyles.TextDim);
            }
        }
    }
}

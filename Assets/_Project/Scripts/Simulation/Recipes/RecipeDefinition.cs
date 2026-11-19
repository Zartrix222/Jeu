using System;
using Industria.Simulation.Items;

namespace Industria.Simulation.Recipes
{
    /// <summary>A transformation performed by a machine type: inputs -> outputs over a duration.</summary>
    [Serializable]
    public sealed class RecipeDefinition
    {
        public string id;
        public string displayName;
        /// <summary>Machine type able to run this recipe (e.g. "smelter").</summary>
        public string machineType;
        public ItemStack[] inputs = Array.Empty<ItemStack>();
        public ItemStack[] outputs = Array.Empty<ItemStack>();
        /// <summary>Seconds per craft cycle.</summary>
        public float duration = 2f;

        public bool UsesInput(string itemId)
        {
            if (inputs == null) return false;
            foreach (var s in inputs) if (s.itemId == itemId) return true;
            return false;
        }

        public int InputAmount(string itemId)
        {
            int total = 0;
            if (inputs == null) return 0;
            foreach (var s in inputs) if (s.itemId == itemId) total += s.count;
            return total;
        }
    }
}

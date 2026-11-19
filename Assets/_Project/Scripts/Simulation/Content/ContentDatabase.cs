using System;
using System.Collections.Generic;
using Industria.Simulation.Items;
using Industria.Simulation.Recipes;

namespace Industria.Simulation.Content
{
    /// <summary>Wrapper types for JSON content files (JsonUtility cannot parse top-level arrays).</summary>
    [Serializable] public sealed class ItemDefinitionList { public ItemDefinition[] items = Array.Empty<ItemDefinition>(); }
    [Serializable] public sealed class RecipeDefinitionList { public RecipeDefinition[] recipes = Array.Empty<RecipeDefinition>(); }
    [Serializable] public sealed class BuildableDefinitionList { public BuildableDefinition[] buildables = Array.Empty<BuildableDefinition>(); }

    [Serializable]
    public sealed class EraDefinition
    {
        public int index;
        public string displayName;
        public string description;
    }

    [Serializable] public sealed class EraDefinitionList { public EraDefinition[] eras = Array.Empty<EraDefinition>(); }

    /// <summary>All static game content. Built once at startup and then read-only.</summary>
    public sealed class ContentDatabase
    {
        public ItemRegistry Items { get; } = new ItemRegistry();
        public RecipeRegistry Recipes { get; } = new RecipeRegistry();
        public List<EraDefinition> Eras { get; } = new List<EraDefinition>();

        private readonly Dictionary<string, BuildableDefinition> _buildables = new Dictionary<string, BuildableDefinition>(StringComparer.Ordinal);
        private readonly List<BuildableDefinition> _buildableList = new List<BuildableDefinition>();

        public IReadOnlyList<BuildableDefinition> Buildables => _buildableList;

        public void RegisterBuildable(BuildableDefinition def)
        {
            if (def == null || string.IsNullOrEmpty(def.id)) throw new ArgumentException("Buildable without id.");
            if (_buildables.ContainsKey(def.id)) throw new ArgumentException($"Duplicate buildable id '{def.id}'.");
            _buildables.Add(def.id, def);
            _buildableList.Add(def);
            _buildableList.Sort((a, b) => a.hotbarOrder.CompareTo(b.hotbarOrder));
        }

        public bool TryGetBuildable(string id, out BuildableDefinition def)
        {
            if (id == null) { def = null; return false; }
            return _buildables.TryGetValue(id, out def);
        }

        /// <summary>Checks cross references (recipe items, costs). Returns a list of human readable problems.</summary>
        public List<string> Validate()
        {
            var problems = new List<string>();
            foreach (var r in Recipes.All)
            {
                foreach (var s in r.inputs ?? Array.Empty<ItemStack>())
                    if (!Items.Contains(s.itemId)) problems.Add($"Recipe '{r.id}' uses unknown input '{s.itemId}'.");
                foreach (var s in r.outputs ?? Array.Empty<ItemStack>())
                    if (!Items.Contains(s.itemId)) problems.Add($"Recipe '{r.id}' produces unknown item '{s.itemId}'.");
            }
            foreach (var b in _buildableList)
            {
                foreach (var s in b.cost ?? Array.Empty<ItemStack>())
                    if (!Items.Contains(s.itemId)) problems.Add($"Buildable '{b.id}' costs unknown item '{s.itemId}'.");
                if (b.behaviour == "processor" && Recipes.ForMachine(b.machineType).Count == 0)
                    problems.Add($"Processor '{b.id}' has no recipe for machine type '{b.machineType}'.");
            }
            return problems;
        }

        /// <summary>Builds the cost of a buildable, taking belt length into account.</summary>
        public static ItemStack[] ComputeCost(BuildableDefinition def, float length)
        {
            if (def.cost == null || def.cost.Length == 0) return Array.Empty<ItemStack>();
            int multiplier = 1;
            if (def.costPerMeters > 0f) multiplier = Math.Max(1, (int)Math.Ceiling(length / def.costPerMeters));
            var result = new ItemStack[def.cost.Length];
            for (int i = 0; i < def.cost.Length; i++)
                result[i] = new ItemStack(def.cost[i].itemId, def.cost[i].count * multiplier);
            return result;
        }
    }
}

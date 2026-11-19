using System;
using System.Collections.Generic;

namespace Industria.Simulation.Recipes
{
    public sealed class RecipeRegistry
    {
        private readonly Dictionary<string, RecipeDefinition> _byId = new Dictionary<string, RecipeDefinition>(StringComparer.Ordinal);
        private readonly List<RecipeDefinition> _ordered = new List<RecipeDefinition>();

        public IReadOnlyList<RecipeDefinition> All => _ordered;

        public void Register(RecipeDefinition recipe)
        {
            if (recipe == null) throw new ArgumentNullException(nameof(recipe));
            if (string.IsNullOrEmpty(recipe.id)) throw new ArgumentException("Recipe without id.");
            if (_byId.ContainsKey(recipe.id)) throw new ArgumentException($"Duplicate recipe id '{recipe.id}'.");
            if (recipe.duration <= 0f) recipe.duration = 0.1f;
            _byId.Add(recipe.id, recipe);
            _ordered.Add(recipe);
        }

        public bool TryGet(string id, out RecipeDefinition recipe)
        {
            if (id == null) { recipe = null; return false; }
            return _byId.TryGetValue(id, out recipe);
        }

        public List<RecipeDefinition> ForMachine(string machineType)
        {
            var list = new List<RecipeDefinition>();
            foreach (var r in _ordered) if (r.machineType == machineType) list.Add(r);
            return list;
        }

        /// <summary>First recipe of that machine type consuming the given item.</summary>
        public RecipeDefinition FindByInput(string machineType, string itemId)
        {
            foreach (var r in _ordered)
                if (r.machineType == machineType && r.UsesInput(itemId)) return r;
            return null;
        }
    }
}

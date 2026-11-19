using System;
using System.Collections.Generic;

namespace Industria.Simulation.Items
{
    /// <summary>Lookup of every item definition known by the game.</summary>
    public sealed class ItemRegistry
    {
        private readonly Dictionary<string, ItemDefinition> _items = new Dictionary<string, ItemDefinition>(StringComparer.Ordinal);
        private readonly List<ItemDefinition> _ordered = new List<ItemDefinition>();

        public IReadOnlyList<ItemDefinition> All => _ordered;

        public void Register(ItemDefinition definition)
        {
            if (definition == null) throw new ArgumentNullException(nameof(definition));
            if (string.IsNullOrEmpty(definition.id)) throw new ArgumentException("Item definition without id.");
            if (_items.ContainsKey(definition.id)) throw new ArgumentException($"Duplicate item id '{definition.id}'.");
            if (definition.maxStack <= 0) definition.maxStack = 1;
            _items.Add(definition.id, definition);
            _ordered.Add(definition);
        }

        public bool Contains(string id) => id != null && _items.ContainsKey(id);

        public bool TryGet(string id, out ItemDefinition definition)
        {
            if (id == null) { definition = null; return false; }
            return _items.TryGetValue(id, out definition);
        }

        public ItemDefinition Get(string id)
        {
            if (!TryGet(id, out var def)) throw new KeyNotFoundException($"Unknown item '{id}'.");
            return def;
        }

        public int MaxStackOf(string id) => TryGet(id, out var def) ? def.maxStack : 1;

        public string NameOf(string id) => TryGet(id, out var def) && !string.IsNullOrEmpty(def.displayName) ? def.displayName : id;
    }
}

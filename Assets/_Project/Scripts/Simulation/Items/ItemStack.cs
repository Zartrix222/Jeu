using System;

namespace Industria.Simulation.Items
{
    /// <summary>A quantity of a single item type. Serializable (public fields) for saves and content files.</summary>
    [Serializable]
    public struct ItemStack
    {
        public string itemId;
        public int count;

        public ItemStack(string itemId, int count)
        {
            this.itemId = itemId;
            this.count = count;
        }

        public bool IsEmpty => string.IsNullOrEmpty(itemId) || count <= 0;

        public override string ToString() => IsEmpty ? "(vide)" : $"{count}x {itemId}";
    }
}

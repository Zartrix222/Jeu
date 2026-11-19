using System;

namespace Industria.Simulation.Items
{
    /// <summary>Static description of an item type, loaded from content data.</summary>
    [Serializable]
    public sealed class ItemDefinition
    {
        public string id;
        public string displayName;
        public string description;
        public string category;
        public int maxStack = 100;
        /// <summary>Hex color (e.g. "#B05A3C") used for the item's icon / belt visual.</summary>
        public string color = "#FFFFFF";
    }
}

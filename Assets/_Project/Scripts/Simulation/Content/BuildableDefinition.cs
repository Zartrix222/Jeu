using System;
using Industria.Simulation.Items;

namespace Industria.Simulation.Content
{
    /// <summary>Port declared by a buildable, in the building's local space.</summary>
    [Serializable]
    public sealed class PortDefinition
    {
        /// <summary>"input" or "output".</summary>
        public string kind = "output";
        public float x, y, z;
        /// <summary>Local direction the port faces (items leave outputs along it).</summary>
        public float dirX, dirY, dirZ = 1f;

        public bool IsInput => kind == "input";
    }

    /// <summary>Everything the player can place in the world: machines, structures, logistics.</summary>
    [Serializable]
    public sealed class BuildableDefinition
    {
        public string id;
        public string displayName;
        public string description;
        /// <summary>"machine", "structure" or "logistics".</summary>
        public string category;
        /// <summary>Technological era index that unlocks it (1 = Survie).</summary>
        public int era = 1;
        /// <summary>Simulation behaviour: "extractor", "processor", "conveyor" or "" for pure structures.</summary>
        public string behaviour;
        /// <summary>Machine type used to filter recipes (processors).</summary>
        public string machineType;
        public ItemStack[] cost = Array.Empty<ItemStack>();
        /// <summary>Only for conveyors: cost multiplied by ceil(length / costPerMeters).</summary>
        public float costPerMeters = 0f;
        /// <summary>Footprint size in metres (x = width, y = height, z = depth).</summary>
        public float sizeX = 1f, sizeY = 1f, sizeZ = 1f;
        /// <summary>Planned power usage in MW (not simulated before the Electricity era).</summary>
        public float powerUsage;
        /// <summary>Extractors: base items per minute on a normal purity node.</summary>
        public float extractionPerMinute;
        /// <summary>Conveyors: speed in metres / second.</summary>
        public float beltSpeed = 1f;
        /// <summary>Capacity of each input / output slot.</summary>
        public int bufferCapacity = 50;
        /// <summary>Must be placed on a resource node.</summary>
        public bool requiresResourceNode;
        /// <summary>Allows free rotation on X / Z (structures).</summary>
        public bool allowTilt;
        /// <summary>Snaps on the foundation grid (structures).</summary>
        public bool gridSnap;
        public PortDefinition[] ports = Array.Empty<PortDefinition>();
        /// <summary>Visual archetype used by the runtime factory ("drill", "smelter", "foundation", ...).</summary>
        public string visual;
        public int hotbarOrder;

        public bool IsConveyor => behaviour == "conveyor";
    }
}

using System;
using System.Collections.Generic;
using Industria.Simulation.Factory;
using Industria.Simulation.Items;

namespace Industria.Simulation.Save
{
    // Plain serializable DTOs (public fields only) so they work with Unity's JsonUtility
    // and with any other serializer used in tests.

    [Serializable]
    public struct SVector3
    {
        public float x, y, z;
        public SVector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
    }

    [Serializable]
    public struct SQuaternion
    {
        public float x, y, z, w;
        public SQuaternion(float x, float y, float z, float w) { this.x = x; this.y = y; this.z = z; this.w = w; }
    }

    [Serializable]
    public sealed class PlayerSave
    {
        public SVector3 position;
        public float yaw;
        public float cameraPitch;
        public List<ItemStack> inventory = new List<ItemStack>();
    }

    /// <summary>A port link: entity id (-1 = nothing) and port index on that entity.</summary>
    [Serializable]
    public struct PortLinkSave
    {
        public int entityId;
        public int portIndex;
        public static PortLinkSave None => new PortLinkSave { entityId = -1, portIndex = -1 };
        public bool IsValid => entityId > 0;
    }

    [Serializable]
    public sealed class BuildingSave
    {
        public int entityId;
        public string buildableId;
        public SVector3 position;
        public SQuaternion rotation;
        /// <summary>Resource node the building sits on (extractors).</summary>
        public string resourceNodeId;
        public bool hasMachineState;
        public MachineState machine = new MachineState();
    }

    [Serializable]
    public sealed class ConveyorSave
    {
        public int entityId;
        public string buildableId;
        public SVector3 start;
        public SVector3 end;
        /// <summary>What feeds this belt (a machine output port or another belt).</summary>
        public PortLinkSave source = PortLinkSave.None;
        /// <summary>What this belt feeds (a machine input port or another belt).</summary>
        public PortLinkSave target = PortLinkSave.None;
        public List<BeltItemState> items = new List<BeltItemState>();
    }

    [Serializable]
    public sealed class SaveGame
    {
        public const int CurrentVersion = 1;

        public int version = CurrentVersion;
        public string gameVersion;
        public string savedAtUtc;
        public int worldSeed;
        public double playTimeSeconds;
        public double simulatedSeconds;
        public PlayerSave player = new PlayerSave();
        public List<BuildingSave> buildings = new List<BuildingSave>();
        public List<ConveyorSave> conveyors = new List<ConveyorSave>();
        public List<string> unlockedBuildables = new List<string>();
        public List<string> completedObjectives = new List<string>();
    }
}

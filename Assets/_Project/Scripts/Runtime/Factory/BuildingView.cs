using System.Collections.Generic;
using Industria.Simulation.Content;
using Industria.Simulation.Factory;
using Industria.World;
using UnityEngine;

namespace Industria.Factory
{
    /// <summary>Scene representation of a placed building. Logic lives in <see cref="Entity"/> (simulation).</summary>
    public sealed class BuildingView : MonoBehaviour
    {
        public BuildableDefinition Definition { get; private set; }
        /// <summary>Simulation entity (null for pure structures such as foundations).</summary>
        public FactoryEntity Entity { get; private set; }
        public Machine Machine => Entity as Machine;
        public ResourceNode Node { get; private set; }
        public List<PortView> Ports { get; } = new List<PortView>();

        public void Init(BuildableDefinition definition, FactoryEntity entity, ResourceNode node)
        {
            Definition = definition;
            Entity = entity;
            Node = node;
            Ports.Clear();
            int outputIndex = 0;
            var ports = definition.ports ?? System.Array.Empty<PortDefinition>();
            for (int i = 0; i < ports.Length; i++)
                Ports.Add(new PortView(this, i, ports[i].IsInput ? -1 : outputIndex++, ports[i]));
        }

        public PortView GetPort(int index) => index >= 0 && index < Ports.Count ? Ports[index] : null;
    }
}

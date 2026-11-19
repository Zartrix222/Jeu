using System.Collections.Generic;
using Industria.Core;
using Industria.Rendering;
using Industria.Simulation.Content;
using Industria.Simulation.Factory;
using Industria.Simulation.Items;
using Industria.Simulation.Save;
using Industria.World;
using UnityEngine;

namespace Industria.Factory
{
    /// <summary>
    /// Bridge between the simulation (<see cref="FactorySimulation"/>) and the scene: creates / removes
    /// buildings and belts, wires their connections, advances the simulation and saves / restores it.
    /// The simulation is advanced every frame regardless of where the player is.
    /// </summary>
    public sealed class FactoryWorld : MonoBehaviour
    {
        private ContentDatabase _content;
        private MaterialLibrary _materials;
        private BuildingVisualFactory _visuals;
        private ConveyorItemRenderer _itemRenderer;
        private Transform _root;
        private Camera _camera;
        private readonly List<BuildingView> _buildings = new List<BuildingView>();
        private readonly List<ConveyorView> _conveyors = new List<ConveyorView>();
        private readonly Dictionary<int, BuildingView> _buildingsById = new Dictionary<int, BuildingView>();
        private readonly Dictionary<int, ConveyorView> _conveyorsById = new Dictionary<int, ConveyorView>();

        public FactorySimulation Simulation { get; } = new FactorySimulation();
        public BuildingVisualFactory Visuals => _visuals;
        public IReadOnlyList<BuildingView> Buildings => _buildings;
        public IReadOnlyList<ConveyorView> Conveyors => _conveyors;
        /// <summary>The simulation only runs while a game is in progress (not in the main menu).</summary>
        public bool Running { get; set; }

        public void Init(ContentDatabase content, MaterialLibrary materials, Camera camera)
        {
            _content = content;
            _materials = materials;
            _camera = camera;
            _visuals = new BuildingVisualFactory(materials);
            _itemRenderer = new ConveyorItemRenderer(content, materials);
            _root = new GameObject("Factory").transform;
        }

        private void Update()
        {
            if (!Running) return;
            Simulation.Advance(Time.deltaTime);
        }

        private void LateUpdate()
        {
            if (_conveyors.Count == 0) return;
            float speed = _conveyors[0].Belt != null ? _conveyors[0].Belt.Speed : 1f;
            ConveyorVisual.Animate(Running ? speed : 0f, Time.deltaTime);
            var camPos = _camera != null ? _camera.transform.position : Vector3.zero;
            _itemRenderer.Render(_conveyors, Running ? Simulation.Accumulator : 0f, camPos);
        }

        // ------------------------------------------------------------------ Buildings

        public BuildingView PlaceBuilding(BuildableDefinition def, Vector3 position, Quaternion rotation, ResourceNode node, int forcedId = -1)
        {
            FactoryEntity entity = null;
            int outputs = 0;
            if (def.ports != null) foreach (var p in def.ports) if (!p.IsInput) outputs++;

            switch (def.behaviour)
            {
                case "extractor":
                    if (node == null) { Debug.LogError($"[Factory] {def.id} nécessite un gisement."); return null; }
                    entity = new ExtractorMachine(def.id, node.ItemId, def.extractionPerMinute * node.PurityMultiplier, def.bufferCapacity, outputs);
                    break;
                case "processor":
                    entity = new ProcessorMachine(def.id, def.machineType, _content.Recipes, def.bufferCapacity, outputs);
                    break;
            }
            if (entity != null) Simulation.Add(entity, forcedId);

            var go = _visuals.Create(def, out var machineVisual);
            go.transform.SetParent(_root, false);
            go.transform.SetPositionAndRotation(position, rotation);
            BuildingVisualFactory.AddCollider(go, def);
            var view = go.AddComponent<BuildingView>();
            view.Init(def, entity, node);
            if (machineVisual != null && entity is Machine machine) machineVisual.Bind(machine);
            if (node != null) node.Occupant = view;

            _buildings.Add(view);
            if (entity != null) _buildingsById[entity.Id] = view;
            return view;
        }

        // ------------------------------------------------------------------ Conveyors

        public ConveyorView PlaceConveyor(BuildableDefinition def, BeltAnchor start, BeltAnchor end, int forcedId = -1)
        {
            var view = CreateConveyor(def, start.Position, end.Position, forcedId);
            Link(view, start, end);
            return view;
        }

        private ConveyorView CreateConveyor(BuildableDefinition def, Vector3 start, Vector3 end, int forcedId)
        {
            float length = Mathf.Max(0.1f, Vector3.Distance(start, end));
            var belt = Simulation.Add(new ConveyorBelt(def.id, length, Mathf.Max(0.1f, def.beltSpeed)), forcedId);

            var go = new GameObject($"{def.displayName} #{belt.Id}");
            go.transform.SetParent(_root, false);
            go.transform.SetPositionAndRotation(start, Quaternion.LookRotation(end - start, Vector3.up));
            ConveyorVisual.Build(go.transform, start, end, _materials, true);
            var col = go.AddComponent<BoxCollider>();
            col.center = new Vector3(0f, -0.05f, length * 0.5f);
            col.size = new Vector3(ConveyorVisual.Width, 0.25f, length);

            var view = go.AddComponent<ConveyorView>();
            view.Init(def, belt, start, end);
            _conveyors.Add(view);
            _conveyorsById[belt.Id] = view;
            return view;
        }

        private void Link(ConveyorView view, BeltAnchor start, BeltAnchor end)
        {
            if (start.Port != null && !start.Port.IsInput && start.Port.IsFree && start.Port.Owner.Machine != null)
            {
                start.Port.Belt = view;
                view.SourcePort = start.Port;
                start.Port.Owner.Machine.SetOutputTarget(start.Port.OutputIndex, view.Belt);
            }
            else if (start.Belt != null && start.Belt != view && start.Belt.EndIsFree)
            {
                start.Belt.TargetBelt = view;
                view.SourceBelt = start.Belt;
                start.Belt.Belt.OutputTarget = view.Belt;
            }

            if (end.Port != null && end.Port.IsInput && end.Port.IsFree && end.Port.Owner.Machine != null)
            {
                end.Port.Belt = view;
                view.TargetPort = end.Port;
                view.Belt.OutputTarget = end.Port.Owner.Machine;
            }
            else if (end.Belt != null && end.Belt != view && end.Belt.StartIsFree)
            {
                end.Belt.SourceBelt = view;
                view.TargetBelt = end.Belt;
                view.Belt.OutputTarget = end.Belt.Belt;
            }
        }

        /// <summary>
        /// Finds the best conveyor anchor near a point: a free output port / belt end (for a start)
        /// or a free input port / belt start (for an end).
        /// </summary>
        public bool TryFindConnection(Vector3 point, bool forStart, float radius, ConveyorView exclude, out BeltAnchor anchor)
        {
            anchor = default;
            float best = radius * radius;
            bool found = false;
            foreach (var b in _buildings)
            {
                if ((b.transform.position - point).sqrMagnitude > 100f) continue;
                foreach (var port in b.Ports)
                {
                    if (!port.IsFree || port.IsInput == forStart) continue;
                    float d = (port.WorldPosition - point).sqrMagnitude;
                    if (d < best) { best = d; found = true; anchor = new BeltAnchor { Position = port.WorldPosition, Port = port }; }
                }
            }
            foreach (var c in _conveyors)
            {
                if (c == exclude) continue;
                if (forStart && c.EndIsFree)
                {
                    float d = (c.End - point).sqrMagnitude;
                    if (d < best) { best = d; found = true; anchor = new BeltAnchor { Position = c.End, Belt = c }; }
                }
                else if (!forStart && c.StartIsFree)
                {
                    float d = (c.Start - point).sqrMagnitude;
                    if (d < best) { best = d; found = true; anchor = new BeltAnchor { Position = c.Start, Belt = c }; }
                }
            }
            return found;
        }

        // ------------------------------------------------------------------ Removal

        /// <summary>Removes a building or a belt and returns the items to give back (cost + contents).</summary>
        public List<ItemStack> Deconstruct(Component target)
        {
            var refund = new List<ItemStack>();
            if (target is BuildingView b) RemoveBuilding(b, refund);
            else if (target is ConveyorView c) RemoveConveyor(c, refund);
            return refund;
        }

        private void RemoveBuilding(BuildingView b, List<ItemStack> refund)
        {
            refund.AddRange(ContentDatabase.ComputeCost(b.Definition, 0f));
            if (b.Machine != null)
            {
                foreach (var s in b.Machine.InputSlots) if (s.Count > 0) refund.Add(new ItemStack(s.ItemId, s.Count));
                foreach (var s in b.Machine.OutputSlots) if (s.Count > 0) refund.Add(new ItemStack(s.ItemId, s.Count));
                if (b.Machine is ProcessorMachine pm && pm.IsRunning && pm.Recipe != null) refund.AddRange(pm.Recipe.inputs);
            }
            foreach (var port in b.Ports)
            {
                if (port.Belt == null) continue;
                if (port.Belt.SourcePort == port) port.Belt.SourcePort = null;
                if (port.Belt.TargetPort == port) port.Belt.TargetPort = null;
                port.Belt = null;
            }
            if (b.Node != null && b.Node.Occupant == b) b.Node.Occupant = null;
            if (b.Entity != null)
            {
                _buildingsById.Remove(b.Entity.Id);
                Simulation.Remove(b.Entity);
            }
            _buildings.Remove(b);
            Destroy(b.gameObject);
        }

        private void RemoveConveyor(ConveyorView c, List<ItemStack> refund)
        {
            refund.AddRange(ContentDatabase.ComputeCost(c.Definition, c.Length));
            foreach (var id in c.Belt.TakeAllItems()) refund.Add(new ItemStack(id, 1));
            if (c.SourcePort != null) c.SourcePort.Belt = null;
            if (c.TargetPort != null) c.TargetPort.Belt = null;
            if (c.SourceBelt != null) c.SourceBelt.TargetBelt = null;
            if (c.TargetBelt != null) c.TargetBelt.SourceBelt = null;
            _conveyorsById.Remove(c.Belt.Id);
            Simulation.Remove(c.Belt);
            _conveyors.Remove(c);
            Destroy(c.gameObject);
        }

        public void Clear()
        {
            foreach (var b in _buildings)
            {
                if (b == null) continue;
                if (b.Node != null && b.Node.Occupant == b) b.Node.Occupant = null;
                Destroy(b.gameObject);
            }
            foreach (var c in _conveyors) if (c != null) Destroy(c.gameObject);
            _buildings.Clear();
            _conveyors.Clear();
            _buildingsById.Clear();
            _conveyorsById.Clear();
            Simulation.Clear();
        }

        // ------------------------------------------------------------------ Save / Load

        public void Capture(SaveGame save)
        {
            save.simulatedSeconds = Simulation.SimulatedTime;
            foreach (var b in _buildings)
            {
                var entry = new BuildingSave
                {
                    entityId = b.Entity != null ? b.Entity.Id : 0,
                    buildableId = b.Definition.id,
                    position = ToS(b.transform.position),
                    rotation = ToS(b.transform.rotation),
                    resourceNodeId = b.Node != null ? b.Node.NodeId : null,
                };
                if (b.Machine != null)
                {
                    entry.hasMachineState = true;
                    entry.machine = b.Machine.CaptureState();
                }
                save.buildings.Add(entry);
            }
            foreach (var c in _conveyors)
            {
                save.conveyors.Add(new ConveyorSave
                {
                    entityId = c.Belt.Id,
                    buildableId = c.Definition.id,
                    start = ToS(c.Start),
                    end = ToS(c.End),
                    source = c.SourcePort != null ? Link(c.SourcePort) : c.SourceBelt != null ? new PortLinkSave { entityId = c.SourceBelt.Belt.Id, portIndex = -1 } : PortLinkSave.None,
                    target = c.TargetPort != null ? Link(c.TargetPort) : c.TargetBelt != null ? new PortLinkSave { entityId = c.TargetBelt.Belt.Id, portIndex = -1 } : PortLinkSave.None,
                    items = c.Belt.CaptureItems(),
                });
            }
        }

        public void Restore(SaveGame save, WorldGenerator world)
        {
            Clear();
            int skipped = 0;
            foreach (var b in save.buildings)
            {
                if (!_content.TryGetBuildable(b.buildableId, out var def)) { skipped++; continue; }
                ResourceNode node = string.IsNullOrEmpty(b.resourceNodeId) ? null : world.FindNode(b.resourceNodeId);
                if (def.requiresResourceNode && (node == null || node.Occupant != null)) { skipped++; continue; }
                var view = PlaceBuilding(def, FromS(b.position), FromS(b.rotation), node, b.entityId > 0 ? b.entityId : -1);
                if (view != null && view.Machine != null && b.hasMachineState) view.Machine.RestoreState(b.machine);
            }

            // Pass 1: create belts. Pass 2: link them (belts can feed belts created later).
            var created = new List<KeyValuePair<ConveyorSave, ConveyorView>>();
            foreach (var c in save.conveyors)
            {
                if (!_content.TryGetBuildable(c.buildableId, out var def)) { skipped++; continue; }
                var view = CreateConveyor(def, FromS(c.start), FromS(c.end), c.entityId > 0 ? c.entityId : -1);
                view.Belt.RestoreItems(c.items);
                created.Add(new KeyValuePair<ConveyorSave, ConveyorView>(c, view));
            }
            foreach (var pair in created)
                Link(pair.Value, ResolveAnchor(pair.Key.source, pair.Value.Start), ResolveAnchor(pair.Key.target, pair.Value.End));

            if (skipped > 0) Debug.LogWarning($"[Factory] {skipped} élément(s) de sauvegarde ignoré(s) (contenu inconnu ou invalide).");
            Debug.Log($"[Factory] Restauré : {_buildings.Count} bâtiments, {_conveyors.Count} convoyeurs.");
        }

        private BeltAnchor ResolveAnchor(PortLinkSave link, Vector3 position)
        {
            if (!link.IsValid) return BeltAnchor.Ground(position);
            if (_buildingsById.TryGetValue(link.entityId, out var building))
                return new BeltAnchor { Position = position, Port = building.GetPort(link.portIndex) };
            if (_conveyorsById.TryGetValue(link.entityId, out var belt))
                return new BeltAnchor { Position = position, Belt = belt };
            return BeltAnchor.Ground(position);
        }

        private static PortLinkSave Link(PortView port) => new PortLinkSave { entityId = port.Owner.Entity.Id, portIndex = port.Index };
        private static SVector3 ToS(Vector3 v) => new SVector3(v.x, v.y, v.z);
        private static SQuaternion ToS(Quaternion q) => new SQuaternion(q.x, q.y, q.z, q.w);
        private static Vector3 FromS(SVector3 v) => new Vector3(v.x, v.y, v.z);
        private static Quaternion FromS(SQuaternion q)
        {
            var r = new Quaternion(q.x, q.y, q.z, q.w);
            return Mathf.Approximately(r.x * r.x + r.y * r.y + r.z * r.z + r.w * r.w, 0f) ? Quaternion.identity : Quaternion.Normalize(r);
        }

    }
}

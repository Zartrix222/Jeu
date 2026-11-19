using System.Collections.Generic;
using Industria.Core;
using Industria.Factory;
using Industria.Input;
using Industria.Rendering;
using Industria.Simulation.Content;
using Industria.Simulation.Items;
using Industria.World;
using UnityEngine;

namespace Industria.Building
{
    public enum BuildTool { None, Place, Deconstruct }

    /// <summary>
    /// Free 3D construction: select a buildable, preview it, rotate it (Y, plus X/Z for structures),
    /// snap to foundations / resource nodes / ports, place it, or deconstruct existing objects.
    /// </summary>
    public sealed class BuildModeController : MonoBehaviour
    {
        public float MaxPlaceDistance = 24f;
        public float MaxBeltLength = 40f;
        public float MinBeltLength = 1f;
        public float MaxBeltSlope = 35f;

        private GameRoot _root;
        private BuildGhost _ghost;
        private GameObject _beltGhost, _beltStartMarker, _highlight;
        private Material _validMat, _invalidMat;
        private readonly Collider[] _overlap = new Collider[32];

        private float _yaw, _pitch, _roll;
        private bool _hasBeltStart;
        private BeltAnchor _beltStart;
        private Component _deconstructTarget;
        private BuildableDefinition _lastSelected;

        public BuildTool Tool { get; private set; }
        public BuildableDefinition Selected { get; private set; }
        public bool IsActive => Tool != BuildTool.None;
        public bool PlacementValid { get; private set; }
        public string Message { get; private set; }
        public ItemStack[] CurrentCost { get; private set; } = System.Array.Empty<ItemStack>();
        public bool HasBeltStart => _hasBeltStart;
        public Component DeconstructTarget => _deconstructTarget;

        public void Init(GameRoot root)
        {
            _root = root;
            _ghost = new BuildGhost(root.Materials);
            _validMat = root.Materials.Ghost(new Color(0.2f, 0.85f, 1f, 0.38f));
            _invalidMat = root.Materials.Ghost(new Color(1f, 0.2f, 0.15f, 0.38f));
            _beltGhost = MakeGhostPrimitive("Ghost convoyeur", MeshLibrary.Cube);
            _beltStartMarker = MakeGhostPrimitive("Ghost départ", MeshLibrary.Sphere);
            _highlight = MakeGhostPrimitive("Surbrillance démolition", MeshLibrary.Cube);
            _highlight.GetComponent<Renderer>().sharedMaterial = _invalidMat;
        }

        private GameObject MakeGhostPrimitive(string name, Mesh mesh)
        {
            var go = PartBuilder.Part(name, null, mesh, _validMat, Vector3.zero, Vector3.one, null, false);
            go.layer = GameLayers.IgnoreRaycast;
            go.SetActive(false);
            return go;
        }

        // ------------------------------------------------------------------ Mode switching

        public void Select(BuildableDefinition def)
        {
            if (def == null) { Exit(); return; }
            Tool = BuildTool.Place;
            Selected = def;
            _lastSelected = def;
            _hasBeltStart = false;
            _pitch = _roll = 0f;
            _highlight.SetActive(false);
            _root.CameraRig.ZoomLocked = true;
        }

        public void EnterDeconstruct()
        {
            Tool = BuildTool.Deconstruct;
            Selected = null;
            _hasBeltStart = false;
            HidePreviews();
            _root.CameraRig.ZoomLocked = false;
        }

        public void Exit()
        {
            Tool = BuildTool.None;
            Selected = null;
            _hasBeltStart = false;
            _deconstructTarget = null;
            HidePreviews();
            _highlight.SetActive(false);
            if (_root != null) _root.CameraRig.ZoomLocked = false;
        }

        private void HidePreviews()
        {
            _ghost?.Hide();
            if (_beltGhost != null) _beltGhost.SetActive(false);
            if (_beltStartMarker != null) _beltStartMarker.SetActive(false);
        }

        // ------------------------------------------------------------------ Update

        private void Update()
        {
            if (_root == null) return;
            if (_root.State != GameState.Playing || _root.Input.GameplayBlocked)
            {
                HidePreviews();
                _highlight.SetActive(false);
                return;
            }

            HandleHotkeys();
            Message = null;
            PlacementValid = false;
            CurrentCost = System.Array.Empty<ItemStack>();

            if (Tool == BuildTool.Place && Selected != null)
            {
                if (Selected.IsConveyor) UpdateConveyor();
                else UpdatePlacement();
            }
            else if (Tool == BuildTool.Deconstruct)
            {
                UpdateDeconstruct();
            }
        }

        private void HandleHotkeys()
        {
            var input = _root.Input;
            var list = _root.Content.Buildables;
            for (int i = 0; i < 9 && i < list.Count; i++)
            {
                if (!input.Pressed(GameAction.Hotbar1 + i)) continue;
                if (Tool == BuildTool.Place && Selected == list[i]) Exit();
                else Select(list[i]);
                return;
            }

            if (input.Pressed(GameAction.BuildMode))
            {
                if (Tool == BuildTool.Place) Exit();
                else Select(_lastSelected ?? (list.Count > 0 ? list[0] : null));
            }
            else if (input.Pressed(GameAction.Deconstruct))
            {
                if (Tool == BuildTool.Deconstruct) Exit(); else EnterDeconstruct();
            }
            else if (input.Pressed(GameAction.Secondary))
            {
                if (_hasBeltStart) _hasBeltStart = false;
                else if (IsActive) Exit();
            }

            if (Tool == BuildTool.Place && Selected != null)
            {
                if (input.Pressed(GameAction.Rotate)) _yaw = Mathf.Repeat(_yaw + 45f, 360f);
                float wheel = input.GameplayZoom;
                if (Mathf.Abs(wheel) > 0.01f) _yaw = Mathf.Repeat(_yaw + Mathf.Sign(wheel) * 15f, 360f);
                if (Selected.allowTilt)
                {
                    if (input.Pressed(GameAction.Tilt)) _pitch = Mathf.Repeat(_pitch + 15f + 180f, 360f) - 180f;
                    if (input.Pressed(GameAction.Roll)) _roll = Mathf.Repeat(_roll + 15f + 180f, 360f) - 180f;
                    if (input.Pressed(GameAction.ResetTilt)) _pitch = _roll = 0f;
                }
            }
        }

        private bool AimRaycast(out RaycastHit hit)
        {
            var cam = _root.CameraRig;
            float camToPivot = Vector3.Distance(cam.transform.position, cam.Pivot);
            if (Physics.Raycast(cam.AimRay, out hit, camToPivot + MaxPlaceDistance + 6f, GameLayers.WorldMask, QueryTriggerInteraction.Ignore))
            {
                if (Vector3.Distance(hit.point, _root.Player.transform.position) <= MaxPlaceDistance) return true;
                Message = "Trop loin";
                return false;
            }
            Message = "Visez le sol";
            return false;
        }

        // ------------------------------------------------------------------ Buildings

        private void UpdatePlacement()
        {
            var def = Selected;
            CurrentCost = ContentDatabase.ComputeCost(def, 0f);
            _ghost.Show(def.id, () => _root.Factory.Visuals.Create(def, out _));
            _beltGhost.SetActive(false);
            _beltStartMarker.SetActive(false);

            if (!AimRaycast(out var hit)) { _ghost.Hide(); return; }

            bool valid = true;
            ResourceNode node = null;
            BuildingView support = null;
            Vector3 pos;
            Quaternion rot;

            if (def.requiresResourceNode)
            {
                node = hit.collider.GetComponentInParent<ResourceNode>() ?? NearestFreeNode(hit.point, 4f);
                if (node != null)
                {
                    pos = node.transform.position;
                    rot = Quaternion.Euler(0f, _yaw, 0f);
                    if (node.Occupant != null) { valid = false; Message = "Gisement déjà exploité"; }
                }
                else
                {
                    pos = hit.point;
                    rot = Quaternion.Euler(0f, _yaw, 0f);
                    valid = false;
                    Message = "À placer sur un gisement";
                }
            }
            else if (def.gridSnap && TrySnapToStructure(hit, def, out pos, out rot, out support))
            {
                // snapped next to / on top of another structure
            }
            else
            {
                support = hit.collider.GetComponentInParent<BuildingView>();
                bool onFoundation = support != null && support.Definition.gridSnap && hit.normal.y > 0.9f;
                if (onFoundation && !def.gridSnap)
                {
                    // 1 m grid in the foundation's frame, rotation in 45° steps relative to it.
                    var local = support.transform.InverseTransformPoint(hit.point);
                    local.x = Mathf.Round(local.x);
                    local.z = Mathf.Round(local.z);
                    local.y = support.Definition.sizeY;
                    pos = support.transform.TransformPoint(local);
                    rot = support.transform.rotation * Quaternion.Euler(0f, _yaw, 0f);
                }
                else
                {
                    pos = hit.point;
                    rot = def.allowTilt ? Quaternion.Euler(_pitch, _yaw, _roll) : Quaternion.Euler(0f, _yaw, 0f);
                    if (def.gridSnap) pos -= Vector3.up * 0.1f; // sink slightly into uneven ground
                    if (!def.gridSnap && hit.normal.y < 0.8f) { valid = false; Message = "Sol trop pentu"; }
                    if (support != null && !support.Definition.gridSnap) { valid = false; Message = "Emplacement occupé"; }
                }
            }

            if (valid && IsBlocked(def, pos, rot, node, support)) { valid = false; Message = "Emplacement obstrué"; }
            if (valid && !_root.PlayerInventory.HasAll(CurrentCost)) { valid = false; Message = "Ressources insuffisantes"; }

            PlacementValid = valid;
            _ghost.SetPose(pos, rot);
            _ghost.SetValid(valid);

            if (valid && _root.Input.Pressed(GameAction.Primary))
            {
                if (!_root.PlayerInventory.TryRemoveAll(CurrentCost)) return;
                var view = _root.Factory.PlaceBuilding(def, pos, rot, node);
                if (view != null) _root.Notifications.Push($"{def.displayName} construit(e)", NotificationKind.Success, 2f);
            }
        }

        private ResourceNode NearestFreeNode(Vector3 point, float radius)
        {
            ResourceNode best = null;
            float bestSqr = radius * radius;
            foreach (var n in _root.World.Nodes)
            {
                float d = (n.transform.position - point).sqrMagnitude;
                if (d < bestSqr) { bestSqr = d; best = n; }
            }
            return best;
        }

        /// <summary>Foundation snapping: aim at a side to extend, at the top edge to extend, at the top centre to stack.</summary>
        private bool TrySnapToStructure(RaycastHit hit, BuildableDefinition def, out Vector3 pos, out Quaternion rot, out BuildingView support)
        {
            pos = default; rot = default;
            support = hit.collider.GetComponentInParent<BuildingView>();
            if (support == null || !support.Definition.gridSnap) return false;

            var sd = support.Definition;
            var t = support.transform;
            var local = t.InverseTransformPoint(hit.point);
            var n = t.InverseTransformDirection(hit.normal);
            Vector3 offset;
            if (n.y > 0.7f)
            {
                float rx = local.x / sd.sizeX, rz = local.z / sd.sizeZ;
                if (Mathf.Abs(rx) < 0.25f && Mathf.Abs(rz) < 0.25f) offset = new Vector3(0f, sd.sizeY, 0f);
                else if (Mathf.Abs(rx) > Mathf.Abs(rz)) offset = new Vector3(Mathf.Sign(rx) * sd.sizeX, 0f, 0f);
                else offset = new Vector3(0f, 0f, Mathf.Sign(rz) * sd.sizeZ);
            }
            else if (n.y < -0.7f)
            {
                offset = new Vector3(0f, -def.sizeY, 0f);
            }
            else if (Mathf.Abs(n.x) > Mathf.Abs(n.z))
            {
                offset = new Vector3(Mathf.Sign(n.x) * (sd.sizeX + def.sizeX) * 0.5f, 0f, 0f);
            }
            else
            {
                offset = new Vector3(0f, 0f, Mathf.Sign(n.z) * (sd.sizeZ + def.sizeZ) * 0.5f);
            }
            pos = t.position + t.rotation * offset;
            rot = t.rotation * Quaternion.Euler(0f, Mathf.Round(_yaw / 90f) * 90f, 0f);
            return true;
        }

        private bool IsBlocked(BuildableDefinition def, Vector3 pos, Quaternion rot, ResourceNode node, BuildingView support)
        {
            var half = new Vector3(Mathf.Max(0.05f, def.sizeX * 0.5f - 0.1f), Mathf.Max(0.05f, def.sizeY * 0.5f - 0.08f), Mathf.Max(0.05f, def.sizeZ * 0.5f - 0.1f));
            var center = pos + rot * new Vector3(0f, def.sizeY * 0.5f + 0.03f, 0f);
            int count = Physics.OverlapBoxNonAlloc(center, half, _overlap, rot, GameLayers.WorldMask, QueryTriggerInteraction.Ignore);
            for (int i = 0; i < count; i++)
            {
                var c = _overlap[i];
                if (c is TerrainCollider) continue;
                if (node != null && c.GetComponentInParent<ResourceNode>() == node) continue;
                if (support != null && c.GetComponentInParent<BuildingView>() == support) continue;
                if (c.GetComponentInParent<ConveyorView>() != null && def.gridSnap) continue; // foundations may pass under belts
                return true;
            }
            // The player lives on the IgnoreRaycast layer: check it separately so nothing is built on top of them.
            count = Physics.OverlapBoxNonAlloc(center, half, _overlap, rot, 1 << GameLayers.IgnoreRaycast, QueryTriggerInteraction.Ignore);
            for (int i = 0; i < count; i++)
                if (_overlap[i] is CharacterController) return true;
            return false;
        }

        // ------------------------------------------------------------------ Conveyors

        private void UpdateConveyor()
        {
            var def = Selected;
            _ghost.Hide();
            if (!AimRaycast(out var hit))
            {
                _beltGhost.SetActive(false);
                _beltStartMarker.SetActive(_hasBeltStart);
                return;
            }

            bool forStart = !_hasBeltStart;
            var exclude = _hasBeltStart ? _beltStart.Belt : null;
            BeltAnchor anchor;
            bool anchorValid = true;
            if (!_root.Factory.TryFindConnection(hit.point, forStart, 1.6f, exclude, out anchor))
            {
                anchor = BeltAnchor.Ground(hit.point + Vector3.up * ConveyorVisual.BeltHeight);
                if (hit.collider.GetComponentInParent<BuildingView>() is BuildingView bv && !bv.Definition.gridSnap)
                {
                    anchorValid = false;
                    Message = forStart ? "Visez une sortie (orange)" : "Visez une entrée (bleue)";
                }
            }

            if (!_hasBeltStart)
            {
                _beltGhost.SetActive(false);
                _beltStartMarker.SetActive(true);
                _beltStartMarker.transform.position = anchor.Position;
                _beltStartMarker.transform.localScale = Vector3.one * (anchor.IsConnection ? 0.7f : 0.45f);
                _beltStartMarker.GetComponent<Renderer>().sharedMaterial = anchorValid ? _validMat : _invalidMat;
                if (Message == null) Message = anchor.IsConnection ? "Départ : connecté à une sortie" : "Cliquez pour fixer le départ";
                PlacementValid = anchorValid;
                if (anchorValid && _root.Input.Pressed(GameAction.Primary))
                {
                    _beltStart = anchor;
                    _hasBeltStart = true;
                }
                return;
            }

            // Start fixed: preview the segment.
            var start = _beltStart.Position;
            var end = anchor.Position;
            var delta = end - start;
            float length = delta.magnitude;
            float slope = length > 0.01f ? Mathf.Asin(Mathf.Clamp(Mathf.Abs(delta.y) / length, 0f, 1f)) * Mathf.Rad2Deg : 0f;
            CurrentCost = ContentDatabase.ComputeCost(def, length);

            bool valid = anchorValid;
            if (valid && length < MinBeltLength) { valid = false; Message = "Trop court"; }
            else if (valid && length > MaxBeltLength) { valid = false; Message = $"Trop long (max {MaxBeltLength:F0} m)"; }
            else if (valid && slope > MaxBeltSlope) { valid = false; Message = "Pente trop forte"; }
            else if (valid && anchor.Port != null && _beltStart.Port != null && anchor.Port.Owner == _beltStart.Port.Owner) { valid = false; Message = "Même machine"; }
            else if (valid && BeltBlocked(start, end, _beltStart, anchor)) { valid = false; Message = "Trajet obstrué"; }
            else if (valid && !_root.PlayerInventory.HasAll(CurrentCost)) { valid = false; Message = "Ressources insuffisantes"; }
            if (valid) Message = $"{length:F1} m" + (anchor.IsConnection ? " — connecté" : "");

            PlacementValid = valid;
            _beltStartMarker.SetActive(true);
            _beltStartMarker.transform.position = start;
            if (length > 0.01f)
            {
                _beltGhost.SetActive(true);
                _beltGhost.transform.SetPositionAndRotation((start + end) * 0.5f, Quaternion.LookRotation(delta, Vector3.up));
                _beltGhost.transform.localScale = new Vector3(ConveyorVisual.Width, 0.18f, length);
                _beltGhost.GetComponent<Renderer>().sharedMaterial = valid ? _validMat : _invalidMat;
            }

            if (valid && _root.Input.Pressed(GameAction.Primary))
            {
                if (!_root.PlayerInventory.TryRemoveAll(CurrentCost)) return;
                var view = _root.Factory.PlaceConveyor(def, _beltStart, anchor);
                // Chain: keep building from the free end of the new belt.
                if (!anchor.IsConnection) _beltStart = new BeltAnchor { Position = view.End, Belt = view };
                else _hasBeltStart = false;
            }
        }

        private bool BeltBlocked(Vector3 start, Vector3 end, BeltAnchor a, BeltAnchor b)
        {
            var delta = end - start;
            float length = delta.magnitude;
            if (length < 1.2f) return false;
            // Ignore the first / last 0.6 m where the belt plugs into machines.
            var center = (start + end) * 0.5f;
            var half = new Vector3(ConveyorVisual.Width * 0.4f, 0.1f, length * 0.5f - 0.6f);
            int count = Physics.OverlapBoxNonAlloc(center, half, _overlap, Quaternion.LookRotation(delta, Vector3.up), GameLayers.WorldMask, QueryTriggerInteraction.Ignore);
            for (int i = 0; i < count; i++)
            {
                var c = _overlap[i];
                if (c is TerrainCollider) continue;
                if (c.GetComponentInParent<ConveyorView>() != null) continue;
                var bv = c.GetComponentInParent<BuildingView>();
                if (bv != null && (bv.Definition.gridSnap || (a.Port != null && a.Port.Owner == bv) || (b.Port != null && b.Port.Owner == bv))) continue;
                return true;
            }
            return false;
        }

        // ------------------------------------------------------------------ Deconstruction

        private void UpdateDeconstruct()
        {
            _deconstructTarget = null;
            _highlight.SetActive(false);
            if (!AimRaycast(out var hit)) return;

            Component target = hit.collider.GetComponentInParent<BuildingView>();
            if (target == null) target = hit.collider.GetComponentInParent<ConveyorView>();
            if (target == null) { Message = "Visez une construction"; return; }

            _deconstructTarget = target;
            var box = target.GetComponent<BoxCollider>();
            if (box != null)
            {
                _highlight.SetActive(true);
                var t = target.transform;
                _highlight.transform.SetPositionAndRotation(t.TransformPoint(box.center), t.rotation);
                _highlight.transform.localScale = box.size * 1.04f + Vector3.one * 0.05f;
            }
            string name = target is BuildingView b ? b.Definition.displayName : ((ConveyorView)target).Definition.displayName;
            Message = $"Démolir : {name}";
            PlacementValid = true;

            if (_root.Input.Pressed(GameAction.Primary))
            {
                var refund = _root.Factory.Deconstruct(target);
                GiveBack(refund);
                _deconstructTarget = null;
                _highlight.SetActive(false);
            }
        }

        private void GiveBack(List<ItemStack> items)
        {
            int lost = 0;
            foreach (var s in items) lost += _root.PlayerInventory.Add(s.itemId, s.count);
            if (lost > 0) _root.Notifications.Push($"Inventaire plein : {lost} objet(s) perdu(s)", NotificationKind.Warning, 4f);
            else _root.Notifications.Push("Démoli — ressources récupérées", NotificationKind.Info, 2f);
        }

        private void OnDestroy()
        {
            _ghost?.Destroy();
            if (_beltGhost != null) Destroy(_beltGhost);
            if (_beltStartMarker != null) Destroy(_beltStartMarker);
            if (_highlight != null) Destroy(_highlight);
        }
    }
}

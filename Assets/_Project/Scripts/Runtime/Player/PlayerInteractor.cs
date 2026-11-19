using Industria.Core;
using Industria.Factory;
using Industria.Input;
using Industria.World;
using UnityEngine;

namespace Industria.Player
{
    /// <summary>
    /// What the player looks at (crosshair): mines resource nodes by hand and opens machine panels.
    /// </summary>
    public sealed class PlayerInteractor : MonoBehaviour
    {
        public float Reach = 5.5f;
        public float SecondsPerOre = 0.45f;

        private GameRoot _root;
        private float _mineTimer;

        public ResourceNode FocusNode { get; private set; }
        public BuildingView FocusBuilding { get; private set; }
        public ConveyorView FocusConveyor { get; private set; }
        public bool IsMining { get; private set; }
        public float MineProgress => Mathf.Clamp01(_mineTimer / SecondsPerOre);

        public void Init(GameRoot root) => _root = root;

        private void Update()
        {
            FocusNode = null;
            FocusBuilding = null;
            FocusConveyor = null;
            bool wasMining = IsMining;
            IsMining = false;

            if (_root == null || _root.State != GameState.Playing || _root.Input.GameplayBlocked || _root.Build.IsActive)
            {
                SetAvatarWorking(false);
                _mineTimer = 0f;
                return;
            }

            var cam = _root.CameraRig;
            var ray = cam.AimRay;
            float camToPivot = Vector3.Distance(cam.transform.position, cam.Pivot);
            if (Physics.Raycast(ray, out var hit, camToPivot + Reach + 2f, GameLayers.WorldMask, QueryTriggerInteraction.Ignore))
            {
                float distToPlayer = Vector3.Distance(hit.point, _root.Player.transform.position + Vector3.up);
                if (distToPlayer <= Reach)
                {
                    FocusNode = hit.collider.GetComponentInParent<ResourceNode>();
                    if (FocusNode == null) FocusBuilding = hit.collider.GetComponentInParent<BuildingView>();
                    if (FocusNode == null && FocusBuilding == null) FocusConveyor = hit.collider.GetComponentInParent<ConveyorView>();
                }
            }

            var input = _root.Input;
            if (FocusNode != null && FocusNode.Occupant == null && (input.Held(GameAction.Interact) || input.Held(GameAction.Primary)))
            {
                IsMining = true;
                if (!wasMining) _mineTimer = 0f;
                _mineTimer += Time.deltaTime;
                if (_mineTimer >= SecondsPerOre)
                {
                    _mineTimer -= SecondsPerOre;
                    Mine(FocusNode);
                }
            }
            else
            {
                _mineTimer = 0f;
            }
            SetAvatarWorking(IsMining);

            if (FocusBuilding != null && FocusBuilding.Machine != null && input.Pressed(GameAction.Interact))
                _root.Hud.OpenMachinePanel(FocusBuilding);
        }

        private void Mine(ResourceNode node)
        {
            var inv = _root.PlayerInventory;
            int amount = node.Purity == ResourcePurity.Pure ? 2 : 1;
            int leftover = inv.Add(node.ItemId, amount);
            node.Punch();
            if (leftover == amount)
            {
                _root.Notifications.Push("Inventaire plein !", NotificationKind.Warning);
                return;
            }
            _root.Notifications.Push($"+{amount - leftover} {_root.Content.Items.NameOf(node.ItemId)}", NotificationKind.Success, 1.5f);
        }

        private void SetAvatarWorking(bool working)
        {
            if (_root != null && _root.Avatar != null) _root.Avatar.Working = working;
        }

        /// <summary>Text shown under the crosshair.</summary>
        public string Prompt
        {
            get
            {
                if (FocusNode != null)
                {
                    string name = _root.Content.Items.NameOf(FocusNode.ItemId);
                    if (FocusNode.Occupant != null) return $"Gisement de {name} ({FocusNode.PurityLabel}) — exploité par une foreuse";
                    return $"[E / Clic maintenu] Miner : {name} ({FocusNode.PurityLabel})";
                }
                if (FocusBuilding != null)
                    return FocusBuilding.Machine != null ? $"[E] Ouvrir : {FocusBuilding.Definition.displayName}" : FocusBuilding.Definition.displayName;
                if (FocusConveyor != null)
                    return $"{FocusConveyor.Definition.displayName} — {FocusConveyor.Length:F1} m, {FocusConveyor.Belt.Items.Count} objet(s)";
                return null;
            }
        }
    }
}

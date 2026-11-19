using System.Collections.Generic;
using Industria.Rendering;
using Industria.Simulation.Content;
using UnityEngine;
using UnityEngine.Rendering;

namespace Industria.Factory
{
    /// <summary>
    /// Draws every item travelling on belts with GPU instancing (no GameObject per item).
    /// Positions are extrapolated between simulation ticks for smooth motion.
    /// </summary>
    public sealed class ConveyorItemRenderer
    {
        private const int BatchSize = 1023;
        private const float ItemSize = 0.3f;
        private const float MaxRenderDistance = 140f;

        private readonly ContentDatabase _content;
        private readonly MaterialLibrary _materials;
        private readonly Dictionary<string, Material> _itemMaterials = new Dictionary<string, Material>();
        private readonly Dictionary<string, List<Matrix4x4>> _batches = new Dictionary<string, List<Matrix4x4>>();
        private readonly Matrix4x4[] _buffer = new Matrix4x4[BatchSize];

        public ConveyorItemRenderer(ContentDatabase content, MaterialLibrary materials)
        {
            _content = content;
            _materials = materials;
        }

        public void Render(IReadOnlyList<ConveyorView> belts, float timeSinceTick, Vector3 cameraPosition)
        {
            foreach (var list in _batches.Values) list.Clear();
            var scale = Vector3.one * ItemSize;
            float maxSqr = MaxRenderDistance * MaxRenderDistance;

            for (int b = 0; b < belts.Count; b++)
            {
                var view = belts[b];
                var belt = view.Belt;
                if (belt == null || belt.Items.Count == 0) continue;
                var mid = (view.Start + view.End) * 0.5f;
                if ((mid - cameraPosition).sqrMagnitude > maxSqr + belt.Length * belt.Length) continue;

                var dir = view.End - view.Start;
                float length = belt.Length;
                var rot = Quaternion.LookRotation(dir, Vector3.up);
                var lift = rot * new Vector3(0f, ItemSize * 0.5f, 0f);
                var items = belt.Items;
                for (int i = 0; i < items.Count; i++)
                {
                    var it = items[i];
                    float pos = it.Position;
                    if (it.Moving)
                    {
                        float limit = i == 0 ? length : items[i - 1].Position - belt.Spacing + belt.Speed * timeSinceTick;
                        pos = Mathf.Min(pos + belt.Speed * timeSinceTick, Mathf.Min(limit, length));
                    }
                    var world = view.Start + dir * (pos / length) + lift;
                    GetBatch(it.ItemId).Add(Matrix4x4.TRS(world, rot, scale));
                }
            }

            var mesh = MeshLibrary.Cube;
            foreach (var pair in _batches)
            {
                var list = pair.Value;
                if (list.Count == 0) continue;
                var mat = GetMaterial(pair.Key);
                for (int start = 0; start < list.Count; start += BatchSize)
                {
                    int count = Mathf.Min(BatchSize, list.Count - start);
                    list.CopyTo(start, _buffer, 0, count);
                    Graphics.DrawMeshInstanced(mesh, 0, mat, _buffer, count, null, ShadowCastingMode.Off, false);
                }
            }
        }

        private List<Matrix4x4> GetBatch(string itemId)
        {
            if (!_batches.TryGetValue(itemId, out var list))
            {
                list = new List<Matrix4x4>(64);
                _batches[itemId] = list;
            }
            return list;
        }

        private Material GetMaterial(string itemId)
        {
            if (_itemMaterials.TryGetValue(itemId, out var mat)) return mat;
            var color = _content.Items.TryGet(itemId, out var def) ? PartBuilder.Hex(def.color, Color.magenta) : Color.magenta;
            bool ingot = def != null && def.category == "material";
            mat = _materials.Lit(color, ingot ? 0.8f : 0.2f, ingot ? 0.65f : 0.25f);
            mat.enableInstancing = true;
            _itemMaterials[itemId] = mat;
            return mat;
        }
    }
}

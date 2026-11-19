using UnityEngine;

namespace Industria.Rendering
{
    /// <summary>Helper to assemble visuals out of shared meshes, without colliders.</summary>
    public static class PartBuilder
    {
        public static GameObject Part(string name, Transform parent, Mesh mesh, Material material, Vector3 localPos, Vector3 localScale, Quaternion? localRot = null, bool castShadows = true)
        {
            var go = new GameObject(name);
            go.layer = parent != null ? parent.gameObject.layer : 0;
            var t = go.transform;
            t.SetParent(parent, false);
            t.localPosition = localPos;
            t.localRotation = localRot ?? Quaternion.identity;
            t.localScale = localScale;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = material;
            r.shadowCastingMode = castShadows ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
            return go;
        }

        public static GameObject Box(string name, Transform parent, Material material, Vector3 localPos, Vector3 size, Quaternion? rot = null)
            => Part(name, parent, MeshLibrary.Cube, material, localPos, size, rot);

        /// <summary>Unity's cylinder is 2 units tall; this takes the real height.</summary>
        public static GameObject Cylinder(string name, Transform parent, Material material, Vector3 localPos, float diameter, float height, Quaternion? rot = null)
            => Part(name, parent, MeshLibrary.Cylinder, material, localPos, new Vector3(diameter, height * 0.5f, diameter), rot);

        public static void SetLayerRecursive(GameObject go, int layer)
        {
            go.layer = layer;
            foreach (Transform child in go.transform) SetLayerRecursive(child.gameObject, layer);
        }

        public static Color Hex(string hex, Color fallback)
        {
            return !string.IsNullOrEmpty(hex) && ColorUtility.TryParseHtmlString(hex, out var c) ? c : fallback;
        }
    }
}

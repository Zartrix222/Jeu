using Industria.Core;
using Industria.Rendering;
using UnityEngine;

namespace Industria.World
{
    /// <summary>Flat reflective water disc for the lake (no collider: the lake bed is walkable).</summary>
    public static class WaterBuilder
    {
        public static GameObject Build(WorldShape shape, MaterialLibrary materials, Transform parent)
        {
            const int segments = 64;
            float radius = shape.LakeRadius * 1.2f;
            var verts = new Vector3[segments + 1];
            var uvs = new Vector2[segments + 1];
            var normals = new Vector3[segments + 1];
            var tris = new int[segments * 3];
            verts[0] = Vector3.zero; uvs[0] = new Vector2(0.5f, 0.5f); normals[0] = Vector3.up;
            for (int i = 0; i < segments; i++)
            {
                float a = i / (float)segments * Mathf.PI * 2f;
                verts[i + 1] = new Vector3(Mathf.Cos(a) * radius, 0f, Mathf.Sin(a) * radius);
                uvs[i + 1] = new Vector2(Mathf.Cos(a) * 0.5f + 0.5f, Mathf.Sin(a) * 0.5f + 0.5f);
                normals[i + 1] = Vector3.up;
                tris[i * 3] = 0;
                tris[i * 3 + 1] = (i + 1) % segments + 1;
                tris[i * 3 + 2] = i + 1;
            }
            var mesh = new Mesh { name = "Lac", vertices = verts, uv = uvs, normals = normals, triangles = tris };
            mesh.RecalculateBounds();

            var go = new GameObject("Lac");
            go.layer = GameLayers.IgnoreRaycast;
            go.transform.SetParent(parent, false);
            go.transform.position = new Vector3(shape.LakeCenter.x, WorldShape.WaterLevel, shape.LakeCenter.y);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = materials.Water();
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return go;
        }
    }
}

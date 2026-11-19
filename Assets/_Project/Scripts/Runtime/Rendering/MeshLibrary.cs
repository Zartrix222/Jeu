using System.Collections.Generic;
using UnityEngine;

namespace Industria.Rendering
{
    /// <summary>Shared meshes: Unity primitives (without their colliders) and procedural shapes.</summary>
    public static class MeshLibrary
    {
        private static readonly Dictionary<PrimitiveType, Mesh> Primitives = new Dictionary<PrimitiveType, Mesh>();
        private static Mesh _cone;
        private static Mesh[] _rocks;

        public static Mesh Primitive(PrimitiveType type)
        {
            if (Primitives.TryGetValue(type, out var mesh) && mesh != null) return mesh;
            var temp = GameObject.CreatePrimitive(type);
            mesh = temp.GetComponent<MeshFilter>().sharedMesh;
            Object.Destroy(temp);
            temp.SetActive(false);
            Primitives[type] = mesh;
            return mesh;
        }

        public static Mesh Cube => Primitive(PrimitiveType.Cube);
        public static Mesh Cylinder => Primitive(PrimitiveType.Cylinder);
        public static Mesh Sphere => Primitive(PrimitiveType.Sphere);
        public static Mesh Capsule => Primitive(PrimitiveType.Capsule);

        /// <summary>Cone of height 1 and radius 0.5, base at y = 0.</summary>
        public static Mesh Cone
        {
            get
            {
                if (_cone != null) return _cone;
                const int segments = 12;
                var verts = new List<Vector3>();
                var normals = new List<Vector3>();
                var tris = new List<int>();
                for (int i = 0; i < segments; i++)
                {
                    float a0 = i / (float)segments * Mathf.PI * 2f;
                    float a1 = (i + 1) / (float)segments * Mathf.PI * 2f;
                    var p0 = new Vector3(Mathf.Cos(a0) * 0.5f, 0f, Mathf.Sin(a0) * 0.5f);
                    var p1 = new Vector3(Mathf.Cos(a1) * 0.5f, 0f, Mathf.Sin(a1) * 0.5f);
                    var tip = new Vector3(0f, 1f, 0f);
                    var n = Vector3.Cross(p1 - p0, tip - p0).normalized;
                    if (n.y < 0f) n = -n;
                    int b = verts.Count;
                    verts.Add(p0); verts.Add(tip); verts.Add(p1);
                    normals.Add(n); normals.Add(n); normals.Add(n);
                    tris.Add(b); tris.Add(b + 1); tris.Add(b + 2);
                    // base
                    b = verts.Count;
                    verts.Add(p0); verts.Add(p1); verts.Add(Vector3.zero);
                    normals.Add(Vector3.down); normals.Add(Vector3.down); normals.Add(Vector3.down);
                    tris.Add(b); tris.Add(b + 1); tris.Add(b + 2);
                }
                _cone = new Mesh { name = "Cone" };
                _cone.SetVertices(verts);
                _cone.SetNormals(normals);
                _cone.SetTriangles(tris, 0);
                _cone.RecalculateBounds();
                FixWinding(_cone);
                return _cone;
            }
        }

        /// <summary>Ensures triangles face their normals (outward).</summary>
        private static void FixWinding(Mesh mesh)
        {
            var v = mesh.vertices; var n = mesh.normals; var t = mesh.triangles;
            for (int i = 0; i < t.Length; i += 3)
            {
                var face = Vector3.Cross(v[t[i + 1]] - v[t[i]], v[t[i + 2]] - v[t[i]]);
                if (Vector3.Dot(face, n[t[i]]) < 0f) { int tmp = t[i + 1]; t[i + 1] = t[i + 2]; t[i + 2] = tmp; }
            }
            mesh.triangles = t;
        }

        /// <summary>A few deformed sphere variants used for rocks and ore chunks.</summary>
        public static Mesh Rock(int variant)
        {
            if (_rocks == null)
            {
                _rocks = new Mesh[4];
                for (int r = 0; r < _rocks.Length; r++)
                {
                    var src = Sphere;
                    var verts = src.vertices;
                    var rng = new System.Random(1000 + r);
                    float ox = (float)rng.NextDouble() * 100f, oz = (float)rng.NextDouble() * 100f;
                    // Weld-aware deformation: identical positions get identical offsets (no cracks).
                    for (int i = 0; i < verts.Length; i++)
                    {
                        var p = verts[i];
                        float k = 0.75f + 0.5f * Mathf.PerlinNoise(p.x * 3.1f + ox, p.z * 3.1f + p.y * 2.3f + oz);
                        p *= k;
                        p.y *= 0.7f;
                        verts[i] = p;
                    }
                    var m = new Mesh { name = "Rock" + r };
                    m.vertices = verts;
                    m.triangles = src.triangles;
                    m.uv = src.uv;
                    m.RecalculateNormals();
                    m.RecalculateBounds();
                    _rocks[r] = m;
                }
            }
            return _rocks[Mathf.Abs(variant) % _rocks.Length];
        }

        /// <summary>Flat quad along +Z of the given length (for belt surfaces). UV.y in units of 0.5 m.</summary>
        public static Mesh BeltSurface(float length, float width)
        {
            var m = new Mesh { name = "BeltSurface" };
            float hw = width * 0.5f;
            m.vertices = new[] { new Vector3(-hw, 0, 0), new Vector3(hw, 0, 0), new Vector3(-hw, 0, length), new Vector3(hw, 0, length) };
            m.normals = new[] { Vector3.up, Vector3.up, Vector3.up, Vector3.up };
            float v = length / 0.5f;
            m.uv = new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, v), new Vector2(1, v) };
            m.triangles = new[] { 0, 2, 1, 1, 2, 3 };
            m.RecalculateBounds();
            return m;
        }
    }
}

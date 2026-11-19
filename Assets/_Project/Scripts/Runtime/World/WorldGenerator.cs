using System.Collections.Generic;
using Industria.Rendering;
using Industria.Simulation.Content;
using UnityEngine;

namespace Industria.World
{
    /// <summary>Generates (and tears down) the explorable world for a seed.</summary>
    public sealed class WorldGenerator
    {
        private readonly ContentDatabase _content;
        private readonly MaterialLibrary _materials;
        private GameObject _root;

        public int Seed { get; private set; }
        public WorldShape Shape { get; private set; }
        public Terrain Terrain { get; private set; }
        public List<ResourceNode> Nodes { get; } = new List<ResourceNode>();
        public bool IsGenerated => _root != null;

        public WorldGenerator(ContentDatabase content, MaterialLibrary materials)
        {
            _content = content;
            _materials = materials;
        }

        public void Generate(int seed)
        {
            Clear();
            var sw = System.Diagnostics.Stopwatch.StartNew();
            Seed = seed;
            Shape = new WorldShape(seed);
            _root = new GameObject("World (NEXUS-01)");
            Terrain = TerrainBuilder.Build(Shape, _materials, _root.transform);
            Nodes.AddRange(ResourceNodeSpawner.Spawn(seed, Shape, Terrain, _content, _materials, _root.transform));
            VegetationSpawner.Spawn(seed, Shape, Terrain, _materials, _root.transform);
            Debug.Log($"[World] Monde généré (graine {seed}) en {sw.ElapsedMilliseconds} ms, {Nodes.Count} gisements.");
        }

        public void Clear()
        {
            Nodes.Clear();
            if (Terrain != null && Terrain.terrainData != null) Object.Destroy(Terrain.terrainData);
            if (_root != null) Object.Destroy(_root);
            _root = null;
            Terrain = null;
        }

        public Vector3 SpawnPoint
        {
            get
            {
                var c = Shape.Center;
                var p = new Vector3(c.x, 0f, c.y - 6f);
                p.y = GroundHeight(p) + 0.2f;
                return p;
            }
        }

        public float GroundHeight(Vector3 p) => Terrain != null ? Terrain.SampleHeight(p) + Terrain.transform.position.y : 0f;

        public ResourceNode FindNode(string nodeId)
        {
            foreach (var n in Nodes) if (n.NodeId == nodeId) return n;
            return null;
        }
    }
}

using System.IO;
using System.Text.Json;
using Industria.Simulation.Content;

namespace Industria.Tests
{
    /// <summary>Loads the real game content JSON files the same way the game does (field based).</summary>
    public static class TestContent
    {
        private static readonly JsonSerializerOptions Options = new JsonSerializerOptions { IncludeFields = true };

        public static T Read<T>(string file)
        {
            var path = Path.Combine(TestContextDir(), "Data", file);
            return JsonSerializer.Deserialize<T>(File.ReadAllText(path), Options);
        }

        private static string TestContextDir() => System.AppContext.BaseDirectory;

        public static ContentDatabase Load()
        {
            var db = new ContentDatabase();
            foreach (var i in Read<ItemDefinitionList>("items.json").items) db.Items.Register(i);
            foreach (var r in Read<RecipeDefinitionList>("recipes.json").recipes) db.Recipes.Register(r);
            foreach (var b in Read<BuildableDefinitionList>("buildables.json").buildables) db.RegisterBuildable(b);
            foreach (var e in Read<EraDefinitionList>("eras.json").eras) db.Eras.Add(e);
            return db;
        }

        public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);
        public static T Deserialize<T>(string json) => JsonSerializer.Deserialize<T>(json, Options);
    }
}

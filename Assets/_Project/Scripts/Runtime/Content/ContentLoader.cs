using Industria.Simulation.Content;
using UnityEngine;

namespace Industria.Content
{
    /// <summary>Loads the JSON content files from Resources/Data into a <see cref="ContentDatabase"/>.</summary>
    public static class ContentLoader
    {
        public static ContentDatabase Load()
        {
            var db = new ContentDatabase();
            var items = Read<ItemDefinitionList>("Data/items");
            var recipes = Read<RecipeDefinitionList>("Data/recipes");
            var buildables = Read<BuildableDefinitionList>("Data/buildables");
            var eras = Read<EraDefinitionList>("Data/eras");

            if (items?.items != null) foreach (var i in items.items) db.Items.Register(i);
            if (recipes?.recipes != null) foreach (var r in recipes.recipes) db.Recipes.Register(r);
            if (buildables?.buildables != null) foreach (var b in buildables.buildables) db.RegisterBuildable(b);
            if (eras?.eras != null) foreach (var e in eras.eras) db.Eras.Add(e);

            foreach (var problem in db.Validate()) Debug.LogError("[Content] " + problem);
            Debug.Log($"[Content] {db.Items.All.Count} objets, {db.Recipes.All.Count} recettes, {db.Buildables.Count} constructions chargés.");
            return db;
        }

        private static T Read<T>(string resourcePath) where T : class
        {
            var asset = Resources.Load<TextAsset>(resourcePath);
            if (asset == null)
            {
                Debug.LogError($"[Content] Fichier introuvable: Resources/{resourcePath}.json");
                return null;
            }
            try
            {
                return JsonUtility.FromJson<T>(asset.text);
            }
            catch (System.Exception e)
            {
                Debug.LogError($"[Content] JSON invalide dans {resourcePath}: {e.Message}");
                return null;
            }
        }
    }
}

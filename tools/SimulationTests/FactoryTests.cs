using Industria.Simulation.Factory;
using Industria.Simulation.Items;
using Industria.Simulation.Save;
using NUnit.Framework;

namespace Industria.Tests
{
    public class FactoryTests
    {
        private static Industria.Simulation.Content.ContentDatabase Db => TestContent.Load();

        private static void RunSeconds(FactorySimulation sim, float seconds)
        {
            int steps = (int)System.Math.Round(seconds / sim.Step);
            for (int i = 0; i < steps; i++) sim.TickOnce();
        }

        [Test]
        public void ExtractorProducesAtConfiguredRateAndStopsWhenFull()
        {
            var sim = new FactorySimulation();
            var drill = sim.Add(new ExtractorMachine("drill_mk1", "ore_iron", 30f, 10));
            RunSeconds(sim, 10f);
            Assert.That(drill.OutputSlots[0].Count, Is.EqualTo(5));
            Assert.That(drill.Status, Is.EqualTo(MachineStatus.Working));
            RunSeconds(sim, 60f);
            Assert.That(drill.OutputSlots[0].Count, Is.EqualTo(10));
            Assert.That(drill.Status, Is.EqualTo(MachineStatus.OutputFull));
        }

        [Test]
        public void SmelterAutoSelectsRecipeAndSmelts()
        {
            var db = Db;
            var sim = new FactorySimulation();
            var smelter = sim.Add(new ProcessorMachine("smelter_mk1", "smelter", db.Recipes, 50));
            Assert.That(smelter.Status, Is.EqualTo(MachineStatus.NoRecipe));
            for (int i = 0; i < 3; i++) Assert.That(smelter.TryInsert("ore_copper"));
            Assert.That(smelter.Recipe.id, Is.EqualTo("smelt_copper"));
            Assert.That(smelter.TryInsert("ore_iron"), Is.False, "Wrong ingredient must be refused");
            RunSeconds(sim, 6.05f);
            Assert.That(smelter.OutputSlots[0].Count, Is.EqualTo(3));
            Assert.That(smelter.InputSlots[0].Count, Is.EqualTo(0));
        }

        [Test]
        public void RecipeCannotChangeWhileMachineHoldsItems()
        {
            var db = Db;
            var smelter = new ProcessorMachine("smelter_mk1", "smelter", db.Recipes, 50);
            smelter.TryInsert("ore_iron");
            db.Recipes.TryGet("smelt_copper", out var copper);
            Assert.That(smelter.SetRecipe(copper), Is.False);
            var inv = new Inventory(4, db.Items);
            smelter.CollectAll(inv);
            Assert.That(inv.Count("ore_iron"), Is.EqualTo(1));
            Assert.That(smelter.SetRecipe(copper), Is.True);
        }

        [Test]
        public void BeltRespectsSpacingAndBlocksAtEnd()
        {
            var sim = new FactorySimulation();
            var belt = sim.Add(new ConveyorBelt("conveyor_mk1", 2f, 1f, 0.5f));
            Assert.That(belt.Capacity, Is.EqualTo(5));
            int inserted = 0;
            for (int i = 0; i < 200; i++)
            {
                if (belt.TryInsert("ore_iron")) inserted++;
                sim.TickOnce();
            }
            Assert.That(inserted, Is.EqualTo(5), "A 2 m belt with 0.5 m spacing holds 5 items");
            Assert.That(belt.Items[0].Position, Is.EqualTo(2f).Within(1e-4));
            for (int i = 1; i < belt.Items.Count; i++)
                Assert.That(belt.Items[i - 1].Position - belt.Items[i].Position, Is.GreaterThanOrEqualTo(0.5f - 1e-4f));
        }

        [Test]
        public void FullChainDrillBeltSmelterBelt()
        {
            var db = Db;
            var sim = new FactorySimulation();
            var drill = sim.Add(new ExtractorMachine("drill_mk1", "ore_iron", 30f, 50));
            var beltIn = sim.Add(new ConveyorBelt("conveyor_mk1", 6f, 1.2f));
            var smelter = sim.Add(new ProcessorMachine("smelter_mk1", "smelter", db.Recipes, 50));
            var beltOut = sim.Add(new ConveyorBelt("conveyor_mk1", 4f, 1.2f));
            drill.SetOutputTarget(0, beltIn);
            beltIn.OutputTarget = smelter;
            smelter.SetOutputTarget(0, beltOut);

            RunSeconds(sim, 60f);

            Assert.That(smelter.Recipe.id, Is.EqualTo("smelt_iron"));
            // 30 ore/min produced, ~5 s of belt transit, 2 s per ingot: expect roughly 25 ingots out.
            int ingotsOnBelt = 0;
            foreach (var it in beltOut.Items) if (it.ItemId == "ingot_iron") ingotsOnBelt++;
            int produced = ingotsOnBelt + smelter.OutputSlots[0].Count;
            Assert.That(produced, Is.InRange(20, 30));
            Assert.That(beltOut.Items.Count, Is.EqualTo(beltOut.Capacity), "Unconnected output belt fills up");
        }

        [Test]
        public void RemovingEntityClearsLinks()
        {
            var sim = new FactorySimulation();
            var drill = sim.Add(new ExtractorMachine("drill_mk1", "ore_iron", 30f, 50));
            var belt = sim.Add(new ConveyorBelt("conveyor_mk1", 3f, 1f));
            drill.SetOutputTarget(0, belt);
            Assert.That(sim.Remove(belt));
            Assert.That(drill.GetOutputTarget(0), Is.Null);
            Assert.That(sim.Entities.Count, Is.EqualTo(1));
        }

        [Test]
        public void AdvanceUsesFixedStepsAndCapsSpiral()
        {
            var sim = new FactorySimulation(0.05f);
            Assert.That(sim.Advance(0.12f), Is.EqualTo(2));
            Assert.That(sim.Accumulator, Is.EqualTo(0.02f).Within(1e-4));
            Assert.That(sim.Advance(10f, 5), Is.EqualTo(5));
            Assert.That(sim.Accumulator, Is.EqualTo(0f));
        }

        [Test]
        public void MachineAndBeltStateRoundTripThroughJson()
        {
            var db = Db;
            var sim = new FactorySimulation();
            var smelter = sim.Add(new ProcessorMachine("smelter_mk1", "smelter", db.Recipes, 50));
            var belt = sim.Add(new ConveyorBelt("conveyor_mk1", 4f, 1f));
            for (int i = 0; i < 5; i++) smelter.TryInsert("ore_copper");
            belt.TryInsert("ingot_copper");
            RunSeconds(sim, 3f);
            belt.TryInsert("ingot_copper");

            var save = new SaveGame { worldSeed = 42 };
            save.buildings.Add(new BuildingSave { entityId = smelter.Id, buildableId = "smelter_mk1", hasMachineState = true, machine = smelter.CaptureState() });
            save.conveyors.Add(new ConveyorSave { entityId = belt.Id, buildableId = "conveyor_mk1", items = belt.CaptureItems() });

            var json = TestContent.Serialize(save);
            var loaded = TestContent.Deserialize<SaveGame>(json);

            var smelter2 = new ProcessorMachine("smelter_mk1", "smelter", db.Recipes, 50);
            smelter2.RestoreState(loaded.buildings[0].machine);
            var belt2 = new ConveyorBelt("conveyor_mk1", 4f, 1f);
            belt2.RestoreItems(loaded.conveyors[0].items);

            Assert.That(loaded.worldSeed, Is.EqualTo(42));
            Assert.That(smelter2.Recipe.id, Is.EqualTo("smelt_copper"));
            Assert.That(smelter2.IsRunning, Is.EqualTo(smelter.IsRunning));
            Assert.That(smelter2.InputSlots[0].Count, Is.EqualTo(smelter.InputSlots[0].Count));
            Assert.That(smelter2.OutputSlots[0].Count, Is.EqualTo(smelter.OutputSlots[0].Count));
            Assert.That(smelter2.Progress01, Is.EqualTo(smelter.Progress01).Within(1e-4));
            Assert.That(belt2.Items.Count, Is.EqualTo(2));
            Assert.That(belt2.Items[0].Position, Is.EqualTo(belt.Items[0].Position).Within(1e-4));
        }
    }
}

namespace Industria.Tests
{
    public class SaveCompatibilityTests
    {
        [NUnit.Framework.Test]
        public void V01SaveWithoutTimeOfDayStillLoads()
        {
            // JSON written by v0.1 (no timeOfDay field).
            const string json = "{\"version\":1,\"gameVersion\":\"0.1.0\",\"worldSeed\":1337,\"playTimeSeconds\":12.5," +
                                "\"player\":{\"position\":{\"x\":1,\"y\":2,\"z\":3},\"yaw\":10,\"cameraPitch\":15,\"inventory\":[{\"itemId\":\"ore_iron\",\"count\":4}]}," +
                                "\"buildings\":[],\"conveyors\":[],\"unlockedBuildables\":[],\"completedObjectives\":[\"scan\"]}";
            var save = TestContent.Deserialize<Industria.Simulation.Save.SaveGame>(json);
            NUnit.Framework.Assert.That(save.worldSeed, NUnit.Framework.Is.EqualTo(1337));
            NUnit.Framework.Assert.That(save.timeOfDay, NUnit.Framework.Is.EqualTo(0.32f));
            NUnit.Framework.Assert.That(save.player.inventory[0].count, NUnit.Framework.Is.EqualTo(4));
            NUnit.Framework.Assert.That(save.completedObjectives, NUnit.Framework.Has.Member("scan"));
        }
    }
}

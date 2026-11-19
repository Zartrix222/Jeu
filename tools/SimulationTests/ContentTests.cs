using Industria.Simulation.Content;
using NUnit.Framework;

namespace Industria.Tests
{
    public class ContentTests
    {
        [Test]
        public void ContentFilesLoadAndCrossReferencesAreValid()
        {
            var db = TestContent.Load();
            Assert.That(db.Items.All.Count, Is.GreaterThanOrEqualTo(4));
            Assert.That(db.Recipes.All.Count, Is.GreaterThanOrEqualTo(2));
            Assert.That(db.Buildables.Count, Is.GreaterThanOrEqualTo(4));
            Assert.That(db.Eras.Count, Is.EqualTo(8));
            Assert.That(db.Validate(), Is.Empty);
        }

        [Test]
        public void StarterLoopIsReachable()
        {
            // The smelter must be buildable from raw ores only, otherwise the player is stuck.
            var db = TestContent.Load();
            Assert.That(db.TryGetBuildable("smelter_mk1", out var smelter));
            foreach (var c in smelter.cost) StringAssert.StartsWith("ore_", c.itemId);
        }

        [Test]
        public void ConveyorCostScalesWithLength()
        {
            var db = TestContent.Load();
            db.TryGetBuildable("conveyor_mk1", out var belt);
            Assert.That(ContentDatabase.ComputeCost(belt, 1f)[0].count, Is.EqualTo(1));
            Assert.That(ContentDatabase.ComputeCost(belt, 2f)[0].count, Is.EqualTo(1));
            Assert.That(ContentDatabase.ComputeCost(belt, 2.1f)[0].count, Is.EqualTo(2));
            Assert.That(ContentDatabase.ComputeCost(belt, 10f)[0].count, Is.EqualTo(5));
        }

        [Test]
        public void PortsAreDeclaredForMachines()
        {
            var db = TestContent.Load();
            db.TryGetBuildable("smelter_mk1", out var smelter);
            db.TryGetBuildable("drill_mk1", out var drill);
            Assert.That(smelter.ports.Length, Is.EqualTo(2));
            Assert.That(drill.ports.Length, Is.EqualTo(1));
            Assert.That(drill.ports[0].IsInput, Is.False);
        }
    }
}

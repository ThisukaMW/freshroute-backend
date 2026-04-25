declare module "density-clustering" {
  class DBSCAN {
    noise: number[];
    run(
      dataset: number[][],
      epsilon: number,
      minPoints: number,
      distanceFunction?: (p: number[], q: number[]) => number
    ): number[][];
  }

  const clustering: {
    DBSCAN: typeof DBSCAN;
  };

  export default clustering;
}

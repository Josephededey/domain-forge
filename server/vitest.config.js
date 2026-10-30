export default {
  // Lets tests import the edge Worker from ../client/worker.
  server: { fs: { allow: ['..'] } },
};

//! Approch 1
const asyncHandler = (requestHandler) => {
    return (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next)).catch((err) =>
            next(err)
        );
    };
};

export { asyncHandler };

//! Approch 2
//: For understanding purpose
// const asyncHandler = () => {}
// const asyncHandler = (fn) => { async () => {}}
// const asyncHandler = (fn) => async () => {};

//! Async-handler using try-catch
// const asyncHandler = (fn) => async (req, res, next) => {
//     try {
//         await fn(req, res, next);
//     } catch (err) {
//         res.status(err.code || 500).json({
//             success: false,
//             message: err.message,
//         });
//     }
// };

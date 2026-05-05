export const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next); // Automatically sends errors to your errorHandler
    };
};